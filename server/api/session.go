package api

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"sync"

	"next-terminal/pkg/constant"
	"next-terminal/pkg/global"
	"next-terminal/pkg/log"
	"next-terminal/server/model"
	"next-terminal/server/utils"

	"github.com/labstack/echo/v4"
	"github.com/pkg/sftp"
)

func SessionPagingEndpoint(c echo.Context) error {
	pageIndex, _ := strconv.Atoi(c.QueryParam("pageIndex"))
	pageSize, _ := strconv.Atoi(c.QueryParam("pageSize"))
	status := c.QueryParam("status")
	userId := c.QueryParam("userId")
	clientIp := c.QueryParam("clientIp")
	assetId := c.QueryParam("assetId")
	protocol := c.QueryParam("protocol")

	items, total, err := sessionRepository.Find(pageIndex, pageSize, status, userId, clientIp, assetId, protocol)

	if err != nil {
		return err
	}

	for i := 0; i < len(items); i++ {
		if status == constant.Disconnected && len(items[i].Recording) > 0 {

			var recording string
			if items[i].Mode == constant.Naive {
				recording = items[i].Recording
			} else {
				recording = items[i].Recording + "/recording"
			}

			if utils.FileExists(recording) {
				items[i].Recording = "1"
			} else {
				items[i].Recording = "0"
			}
		} else {
			items[i].Recording = "0"
		}
	}

	return Success(c, H{
		"total": total,
		"items": items,
	})
}

func SessionDeleteEndpoint(c echo.Context) error {
	sessionIds := c.Param("id")
	split := strings.Split(sessionIds, ",")
	err := sessionRepository.DeleteByIds(split)
	if err != nil {
		return err
	}

	return Success(c, nil)
}

func SessionConnectEndpoint(c echo.Context) error {
	sessionId := c.Param("id")

	session := model.Session{}
	session.ID = sessionId
	session.Status = constant.Connected
	session.ConnectedTime = utils.NowJsonTime()

	if err := sessionRepository.UpdateById(&session, sessionId); err != nil {
		return err
	}
	return Success(c, nil)
}

func SessionDisconnectEndpoint(c echo.Context) error {
	sessionIds := c.Param("id")

	split := strings.Split(sessionIds, ",")
	for i := range split {
		CloseSessionById(split[i], ForcedDisconnect, "?????????????????????????????????")
	}
	return Success(c, nil)
}

var mutex sync.Mutex

func CloseSessionById(sessionId string, code int, reason string) {
	mutex.Lock()
	defer mutex.Unlock()
	observable, _ := global.Store.Get(sessionId)
	if observable != nil {
		log.Debugf("??????%v???????????????????????????%v", sessionId, reason)
		observable.Subject.Close(code, reason)

		for i := 0; i < len(observable.Observers); i++ {
			observable.Observers[i].Close(code, reason)
			log.Debugf("??????????????????%v????????????", sessionId)
		}
	}
	global.Store.Del(sessionId)

	s, err := sessionRepository.FindById(sessionId)
	if err != nil {
		return
	}

	if s.Status == constant.Disconnected {
		return
	}

	if s.Status == constant.Connecting {
		// ?????????????????????????????????????????????
		_ = sessionRepository.DeleteById(sessionId)
		return
	}

	session := model.Session{}
	session.ID = sessionId
	session.Status = constant.Disconnected
	session.DisconnectedTime = utils.NowJsonTime()
	session.Code = code
	session.Message = reason

	_ = sessionRepository.UpdateById(&session, sessionId)
}

func SessionResizeEndpoint(c echo.Context) error {
	width := c.QueryParam("width")
	height := c.QueryParam("height")
	sessionId := c.Param("id")

	if len(width) == 0 || len(height) == 0 {
		panic("????????????")
	}

	intWidth, _ := strconv.Atoi(width)

	intHeight, _ := strconv.Atoi(height)

	if err := sessionRepository.UpdateWindowSizeById(intWidth, intHeight, sessionId); err != nil {
		return err
	}
	return Success(c, "")
}

func SessionCreateEndpoint(c echo.Context) error {
	assetId := c.QueryParam("assetId")
	mode := c.QueryParam("mode")

	if mode == constant.Naive {
		mode = constant.Naive
	} else {
		mode = constant.Guacd
	}

	user, _ := GetCurrentAccount(c)

	if constant.TypeUser == user.Type {
		// ???????????????????????????
		assetIds, err := resourceSharerRepository.FindAssetIdsByUserId(user.ID)
		if err != nil {
			return err
		}

		if !utils.Contains(assetIds, assetId) {
			return errors.New("??????????????????????????????")
		}
	}

	asset, err := assetRepository.FindById(assetId)
	if err != nil {
		return err
	}

	session := &model.Session{
		ID:         utils.UUID(),
		AssetId:    asset.ID,
		Username:   asset.Username,
		Password:   asset.Password,
		PrivateKey: asset.PrivateKey,
		Passphrase: asset.Passphrase,
		Protocol:   asset.Protocol,
		IP:         asset.IP,
		Port:       asset.Port,
		Status:     constant.NoConnect,
		Creator:    user.ID,
		ClientIP:   c.RealIP(),
		Mode:       mode,
	}

	if asset.AccountType == "credential" {
		credential, err := credentialRepository.FindById(asset.CredentialId)
		if err != nil {
			return err
		}

		if credential.Type == constant.Custom {
			session.Username = credential.Username
			session.Password = credential.Password
		} else {
			session.Username = credential.Username
			session.PrivateKey = credential.PrivateKey
			session.Passphrase = credential.Passphrase
		}
	}

	if err := sessionRepository.Create(session); err != nil {
		return err
	}

	return Success(c, echo.Map{"id": session.ID})
}

func SessionUploadEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	session, err := sessionRepository.FindById(sessionId)
	if err != nil {
		return err
	}
	file, err := c.FormFile("file")
	if err != nil {
		return err
	}

	filename := file.Filename
	src, err := file.Open()
	if err != nil {
		return err
	}

	remoteDir := c.QueryParam("dir")
	remoteFile := path.Join(remoteDir, filename)

	if "ssh" == session.Protocol {
		tun, ok := global.Store.Get(sessionId)
		if !ok {
			return errors.New("??????sftp???????????????")
		}

		dstFile, err := tun.Subject.NextTerminal.SftpClient.Create(remoteFile)
		if err != nil {
			return err
		}
		defer dstFile.Close()

		buf := make([]byte, 1024)
		for {
			n, err := src.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Warnf("?????????????????? %v", err)
				} else {
					break
				}
			}
			_, _ = dstFile.Write(buf[:n])
		}
		return Success(c, nil)
	} else if "rdp" == session.Protocol {

		if strings.Contains(remoteFile, "../") {
			SafetyRuleTrigger(c)
			return Fail(c, -1, ":) ??????IP??????????????????????????????????????????")
		}

		drivePath, err := propertyRepository.GetDrivePath()
		if err != nil {
			return err
		}

		// Destination
		dst, err := os.Create(path.Join(drivePath, remoteFile))
		if err != nil {
			return err
		}
		defer dst.Close()

		// Copy
		if _, err = io.Copy(dst, src); err != nil {
			return err
		}
		return Success(c, nil)
	}

	return err
}

func SessionDownloadEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	session, err := sessionRepository.FindById(sessionId)
	if err != nil {
		return err
	}
	//remoteDir := c.Query("dir")
	remoteFile := c.QueryParam("file")
	// ??????????????????????????????
	filenameWithSuffix := path.Base(remoteFile)
	if "ssh" == session.Protocol {
		tun, ok := global.Store.Get(sessionId)
		if !ok {
			return errors.New("??????sftp???????????????")
		}

		dstFile, err := tun.Subject.NextTerminal.SftpClient.Open(remoteFile)
		if err != nil {
			return err
		}

		defer dstFile.Close()
		c.Response().Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filenameWithSuffix))

		var buff bytes.Buffer
		if _, err := dstFile.WriteTo(&buff); err != nil {
			return err
		}

		return c.Stream(http.StatusOK, echo.MIMEOctetStream, bytes.NewReader(buff.Bytes()))
	} else if "rdp" == session.Protocol {
		if strings.Contains(remoteFile, "../") {
			SafetyRuleTrigger(c)
			return Fail(c, -1, ":) ??????IP??????????????????????????????????????????")
		}
		drivePath, err := propertyRepository.GetDrivePath()
		if err != nil {
			return err
		}
		return c.Attachment(path.Join(drivePath, remoteFile), filenameWithSuffix)
	}

	return err
}

type File struct {
	Name    string         `json:"name"`
	Path    string         `json:"path"`
	IsDir   bool           `json:"isDir"`
	Mode    string         `json:"mode"`
	IsLink  bool           `json:"isLink"`
	ModTime utils.JsonTime `json:"modTime"`
	Size    int64          `json:"size"`
}

func SessionLsEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	session, err := sessionRepository.FindById(sessionId)
	if err != nil {
		return err
	}
	remoteDir := c.QueryParam("dir")
	if "ssh" == session.Protocol {
		tun, ok := global.Store.Get(sessionId)
		if !ok {
			return errors.New("??????sftp???????????????")
		}

		if tun.Subject.NextTerminal == nil {
			nextTerminal, err := CreateNextTerminalBySession(session)
			if err != nil {
				return err
			}
			tun.Subject.NextTerminal = nextTerminal
		}

		if tun.Subject.NextTerminal.SftpClient == nil {
			sftpClient, err := sftp.NewClient(tun.Subject.NextTerminal.SshClient)
			if err != nil {
				log.Errorf("??????sftp??????????????????%v", err.Error())
				return err
			}
			tun.Subject.NextTerminal.SftpClient = sftpClient
		}

		fileInfos, err := tun.Subject.NextTerminal.SftpClient.ReadDir(remoteDir)
		if err != nil {
			return err
		}

		var files = make([]File, 0)
		for i := range fileInfos {

			// ??????????????????
			if strings.HasPrefix(fileInfos[i].Name(), ".") {
				continue
			}

			file := File{
				Name:    fileInfos[i].Name(),
				Path:    path.Join(remoteDir, fileInfos[i].Name()),
				IsDir:   fileInfos[i].IsDir(),
				Mode:    fileInfos[i].Mode().String(),
				IsLink:  fileInfos[i].Mode()&os.ModeSymlink == os.ModeSymlink,
				ModTime: utils.NewJsonTime(fileInfos[i].ModTime()),
				Size:    fileInfos[i].Size(),
			}

			files = append(files, file)
		}

		return Success(c, files)
	} else if "rdp" == session.Protocol {
		if strings.Contains(remoteDir, "../") {
			SafetyRuleTrigger(c)
			return Fail(c, -1, ":) ??????IP??????????????????????????????????????????")
		}
		drivePath, err := propertyRepository.GetDrivePath()
		if err != nil {
			return err
		}
		fileInfos, err := ioutil.ReadDir(path.Join(drivePath, remoteDir))
		if err != nil {
			return err
		}

		var files = make([]File, 0)
		for i := range fileInfos {
			file := File{
				Name:    fileInfos[i].Name(),
				Path:    path.Join(remoteDir, fileInfos[i].Name()),
				IsDir:   fileInfos[i].IsDir(),
				Mode:    fileInfos[i].Mode().String(),
				IsLink:  fileInfos[i].Mode()&os.ModeSymlink == os.ModeSymlink,
				ModTime: utils.NewJsonTime(fileInfos[i].ModTime()),
				Size:    fileInfos[i].Size(),
			}

			files = append(files, file)
		}

		return Success(c, files)
	}

	return errors.New("??????????????????????????????")
}

func SafetyRuleTrigger(c echo.Context) {
	log.Warnf("IP %v ????????????????????????ban??????IP", c.RealIP())
	security := model.AccessSecurity{
		ID:     utils.UUID(),
		Source: "??????????????????",
		IP:     c.RealIP(),
		Rule:   constant.AccessRuleReject,
	}

	_ = accessSecurityRepository.Create(&security)
}

func SessionMkDirEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	session, err := sessionRepository.FindById(sessionId)
	if err != nil {
		return err
	}
	remoteDir := c.QueryParam("dir")
	if "ssh" == session.Protocol {
		tun, ok := global.Store.Get(sessionId)
		if !ok {
			return errors.New("??????sftp???????????????")
		}
		if err := tun.Subject.NextTerminal.SftpClient.Mkdir(remoteDir); err != nil {
			return err
		}
		return Success(c, nil)
	} else if "rdp" == session.Protocol {
		if strings.Contains(remoteDir, "../") {
			SafetyRuleTrigger(c)
			return Fail(c, -1, ":) ??????IP??????????????????????????????????????????")
		}
		drivePath, err := propertyRepository.GetDrivePath()
		if err != nil {
			return err
		}

		if err := os.MkdirAll(path.Join(drivePath, remoteDir), os.ModePerm); err != nil {
			return err
		}
		return Success(c, nil)
	}

	return errors.New("??????????????????????????????")
}

func SessionRmEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	session, err := sessionRepository.FindById(sessionId)
	if err != nil {
		return err
	}
	key := c.QueryParam("key")
	if "ssh" == session.Protocol {
		tun, ok := global.Store.Get(sessionId)
		if !ok {
			return errors.New("??????sftp???????????????")
		}

		sftpClient := tun.Subject.NextTerminal.SftpClient

		stat, err := sftpClient.Stat(key)
		if err != nil {
			return err
		}

		if stat.IsDir() {
			fileInfos, err := sftpClient.ReadDir(key)
			if err != nil {
				return err
			}

			for i := range fileInfos {
				if err := sftpClient.Remove(path.Join(key, fileInfos[i].Name())); err != nil {
					return err
				}
			}

			if err := sftpClient.RemoveDirectory(key); err != nil {
				return err
			}
		} else {
			if err := sftpClient.Remove(key); err != nil {
				return err
			}
		}

		return Success(c, nil)
	} else if "rdp" == session.Protocol {
		if strings.Contains(key, "../") {
			SafetyRuleTrigger(c)
			return Fail(c, -1, ":) ??????IP??????????????????????????????????????????")
		}
		drivePath, err := propertyRepository.GetDrivePath()
		if err != nil {
			return err
		}

		if err := os.RemoveAll(path.Join(drivePath, key)); err != nil {
			return err
		}

		return Success(c, nil)
	}

	return errors.New("??????????????????????????????")
}

func SessionRenameEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	session, err := sessionRepository.FindById(sessionId)
	if err != nil {
		return err
	}
	oldName := c.QueryParam("oldName")
	newName := c.QueryParam("newName")
	if "ssh" == session.Protocol {
		tun, ok := global.Store.Get(sessionId)
		if !ok {
			return errors.New("??????sftp???????????????")
		}

		sftpClient := tun.Subject.NextTerminal.SftpClient

		if err := sftpClient.Rename(oldName, newName); err != nil {
			return err
		}

		return Success(c, nil)
	} else if "rdp" == session.Protocol {
		if strings.Contains(oldName, "../") {
			SafetyRuleTrigger(c)
			return Fail(c, -1, ":) ??????IP??????????????????????????????????????????")
		}
		drivePath, err := propertyRepository.GetDrivePath()
		if err != nil {
			return err
		}

		if err := os.Rename(path.Join(drivePath, oldName), path.Join(drivePath, newName)); err != nil {
			return err
		}

		return Success(c, nil)
	}
	return errors.New("??????????????????????????????")
}

func SessionRecordingEndpoint(c echo.Context) error {
	sessionId := c.Param("id")
	session, err := sessionRepository.FindById(sessionId)
	if err != nil {
		return err
	}

	var recording string
	if session.Mode == constant.Naive {
		recording = session.Recording
	} else {
		recording = session.Recording + "/recording"
	}

	log.Debugf("?????????????????????%v,????????????: %v, ???????????????: %v", recording, utils.FileExists(recording), utils.IsFile(recording))
	return c.File(recording)
}
