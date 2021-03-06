import React, {Component} from 'react';

import {
    Alert,
    Badge,
    Button,
    Col,
    Divider,
    Dropdown,
    Form,
    Input,
    Layout,
    Menu,
    Modal,
    notification,
    Row,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Transfer,
    Typography
} from "antd";
import qs from "qs";
import AssetModal from "./AssetModal";
import request from "../../common/request";
import {message} from "antd/es";
import {getHeaders, isEmpty} from "../../utils/utils";
import dayjs from 'dayjs';
import {
    DeleteOutlined,
    DownOutlined,
    ExclamationCircleOutlined,
    ImportOutlined,
    PlusOutlined,
    SyncOutlined,
    UndoOutlined,
    UploadOutlined
} from '@ant-design/icons';
import {PROTOCOL_COLORS} from "../../common/constants";

import {hasPermission, isAdmin} from "../../service/permission";
import Upload from "antd/es/upload";
import axios from "axios";
import {server} from "../../common/env";


const confirm = Modal.confirm;
const {Search} = Input;
const {Content} = Layout;
const {Title, Text} = Typography;

class Asset extends Component {

    inputRefOfName = React.createRef();
    inputRefOfIp = React.createRef();
    changeOwnerFormRef = React.createRef();

    state = {
        items: [],
        total: 0,
        queryParams: {
            pageIndex: 1,
            pageSize: 10,
            protocol: '',
            tags: ''
        },
        loading: false,
        modalVisible: false,
        modalTitle: '',
        modalConfirmLoading: false,
        credentials: [],
        tags: [],
        selectedTags: [],
        model: {},
        selectedRowKeys: [],
        delBtnLoading: false,
        changeOwnerModalVisible: false,
        changeSharerModalVisible: false,
        changeOwnerConfirmLoading: false,
        changeSharerConfirmLoading: false,
        users: [],
        selected: {},
        selectedSharers: [],
        importModalVisible: false,
        fileList: [],
        uploading: false,
    };

    async componentDidMount() {

        this.loadTableData();

        let result = await request.get('/tags');
        if (result['code'] === 1) {
            this.setState({
                tags: result['data']
            })
        }
    }

    async delete(id) {
        const result = await request.delete('/assets/' + id);
        if (result['code'] === 1) {
            message.success('????????????');
            await this.loadTableData(this.state.queryParams);
        } else {
            message.error('???????????? :( ' + result.message, 10);
        }

    }

    async loadTableData(queryParams) {
        this.setState({
            loading: true
        });

        queryParams = queryParams || this.state.queryParams;

        // queryParams
        let paramsStr = qs.stringify(queryParams);

        let data = {
            items: [],
            total: 0
        };

        try {
            let result = await request.get('/assets/paging?' + paramsStr);
            if (result['code'] === 1) {
                data = result['data'];
            } else {
                message.error(result['message']);
            }
        } catch (e) {

        } finally {
            const items = data.items.map(item => {
                return {'key': item['id'], ...item}
            })
            this.setState({
                items: items,
                total: data.total,
                queryParams: queryParams,
                loading: false
            });
        }
    }

    handleChangPage = async (pageIndex, pageSize) => {
        let queryParams = this.state.queryParams;
        queryParams.pageIndex = pageIndex;
        queryParams.pageSize = pageSize;

        this.setState({
            queryParams: queryParams
        });

        await this.loadTableData(queryParams)
    };

    handleSearchByName = name => {
        let query = {
            ...this.state.queryParams,
            'pageIndex': 1,
            'pageSize': this.state.queryParams.pageSize,
            'name': name,
        }

        this.loadTableData(query);
    };

    handleSearchByIp = ip => {
        let query = {
            ...this.state.queryParams,
            'pageIndex': 1,
            'pageSize': this.state.queryParams.pageSize,
            'ip': ip,
        }

        this.loadTableData(query);
    };

    handleTagsChange = tags => {
        this.setState({
            selectedTags: tags
        })
        let query = {
            ...this.state.queryParams,
            'pageIndex': 1,
            'pageSize': this.state.queryParams.pageSize,
            'tags': tags.join(','),
        }

        this.loadTableData(query);
    }

    handleSearchByProtocol = protocol => {
        let query = {
            ...this.state.queryParams,
            'pageIndex': 1,
            'pageSize': this.state.queryParams.pageSize,
            'protocol': protocol,
        }
        this.loadTableData(query);
    }

    showDeleteConfirm(id, content) {
        let self = this;
        confirm({
            title: '???????????????????????????????',
            content: content,
            okText: '??????',
            okType: 'danger',
            cancelText: '??????',
            onOk() {
                self.delete(id);
            }
        });
    };

    async update(id) {
        let result = await request.get(`/assets/${id}`);
        if (result.code !== 1) {
            message.error(result.message, 10);
            return;
        }
        await this.showModal('????????????', result.data);
    }

    async copy(id) {
        let result = await request.get(`/assets/${id}`);
        if (result.code !== 1) {
            message.error(result.message, 10);
            return;
        }
        result.data['id'] = undefined;
        await this.showModal('????????????', result.data);
    }

    async showModal(title, asset = {}) {
        // ????????????
        let getCredentials = request.get('/credentials');
        let getTags = request.get('/tags');

        let credentials = [];
        let tags = [];

        let r1 = await getCredentials;
        let r2 = await getTags;

        if (r1['code'] === 1) {
            credentials = r1['data'];
        }

        if (r2['code'] === 1) {
            tags = r2['data'];
        }

        if (asset['tags'] && typeof (asset['tags']) === 'string') {
            if (asset['tags'] === '' || asset['tags'] === '-') {
                asset['tags'] = [];
            } else {
                asset['tags'] = asset['tags'].split(',');
            }
        } else {
            asset['tags'] = [];
        }

        asset['use-ssl'] = asset['use-ssl'] === 'true';

        asset['ignore-cert'] = asset['ignore-cert'] === 'true';

        console.log(asset)

        this.setState({
            modalTitle: title,
            modalVisible: true,
            credentials: credentials,
            tags: tags,
            model: asset
        });
    };

    handleCancelModal = e => {
        this.setState({
            modalTitle: '',
            modalVisible: false
        });
    };

    handleOk = async (formData) => {
        // ?????? form ???????????????
        this.setState({
            modalConfirmLoading: true
        });

        console.log(formData)
        if (formData['tags']) {
            formData.tags = formData['tags'].join(',');
        }

        if (formData.id) {
            // ?????????????????????
            const result = await request.put('/assets/' + formData.id, formData);
            if (result.code === 1) {
                message.success('????????????', 3);

                this.setState({
                    modalVisible: false
                });
                await this.loadTableData(this.state.queryParams);
            } else {
                message.error('???????????? :( ' + result.message, 10);
            }
        } else {
            // ?????????????????????
            const result = await request.post('/assets', formData);
            if (result.code === 1) {
                message.success('????????????', 3);

                this.setState({
                    modalVisible: false
                });
                await this.loadTableData(this.state.queryParams);
            } else {
                message.error('???????????? :( ' + result.message, 10);
            }
        }

        this.setState({
            modalConfirmLoading: false
        });
    };

    access = async (record) => {
        const id = record['id'];
        const protocol = record['protocol'];
        const name = record['name'];

        message.loading({content: '??????????????????????????????...', key: id});
        let result = await request.post(`/assets/${id}/tcping`);
        if (result.code === 1) {
            if (result.data === true) {
                message.success({content: '???????????????????????????????????????????????????????????????????????????', key: id, duration: 3});
                if (protocol === 'ssh') {
                    result = await request.get(`/assets/${id}/attributes`);
                    if (result.code === 1 && result['data']['ssh-mode'] === 'naive') {
                        window.open(`#/term?assetId=${id}&assetName=${name}`);
                    } else {
                        window.open(`#/access?assetId=${id}&assetName=${name}&protocol=${protocol}`);
                    }
                } else {
                    window.open(`#/access?assetId=${id}&assetName=${name}&protocol=${protocol}`);
                }
            } else {
                message.warn('??????????????????????????????????????????????????????', 10);
            }
        } else {
            message.error('???????????? :( ' + result.message, 10);
        }

    }

    monitor = async (record) => {
        const id = record['id'];
        var protocol  = record["protocol"];
        const name = record["name"];
        message.loading({content: '??????????????????????????????...', key: id});
        let result = await request.post(`/assets/${id}/tcping`);
        if (result.code === 1) {
            if (result.data === true) {
                message.success({content: '???????????????????????????????????????????????????????????????????????????', key: id, duration: 3});
                if (protocol === 'ssh') {
                    window.open(`/#/monitor/${id}/?name=${name}`);
                } else {
                    message.warn('?????????????????????ssh???????????????', 10);
                }
            } else {
                message.warn('??????????????????????????????????????????????????????', 10);
            }
        } else {
            message.error('???????????? :( ' + result.message, 10);
        }

    }

    batchDelete = async () => {
        this.setState({
            delBtnLoading: true
        })
        try {
            let result = await request.delete('/assets/' + this.state.selectedRowKeys.join(','));
            if (result.code === 1) {
                message.success('????????????', 3);
                this.setState({
                    selectedRowKeys: []
                })
                await this.loadTableData(this.state.queryParams);
            } else {
                message.error('???????????? :( ' + result.message, 10);
            }
        } finally {
            this.setState({
                delBtnLoading: false
            })
        }
    }

    handleSearchByNickname = async nickname => {
        const result = await request.get(`/users/paging?pageIndex=1&pageSize=100&nickname=${nickname}`);
        if (result.code !== 1) {
            message.error(result.message, 10);
            return;
        }

        const items = result['data']['items'].map(item => {
            return {'key': item['id'], ...item}
        })

        this.setState({
            users: items
        })
    }

    handleSharersChange = async targetKeys => {
        this.setState({
            selectedSharers: targetKeys
        })
    }

    handleShowSharer = async (record) => {
        let r1 = this.handleSearchByNickname('');
        let r2 = request.get(`/resource-sharers/sharers?resourceId=${record['id']}`);

        await r1;
        let result = await r2;

        let selectedSharers = [];
        if (result['code'] !== 1) {
            message.error(result['message']);
        } else {
            selectedSharers = result['data'];
        }

        let users = this.state.users;
        users = users.map(item => {
            let disabled = false;
            if (record['owner'] === item['id']) {
                disabled = true;
            }
            return {...item, 'disabled': disabled}
        });

        this.setState({
            selectedSharers: selectedSharers,
            selected: record,
            changeSharerModalVisible: true,
            users: users
        })
    }

    handleCancelUpdateAttr = () => {
        this.setState({
            attrVisible: false,
            selected: {},
            attributes: {}
        });
    }

    handleTableChange = (pagination, filters, sorter) => {
        let query = {
            ...this.state.queryParams,
            'order': sorter.order,
            'field': sorter.field
        }

        this.loadTableData(query);
    }

    render() {

        const columns = [{
            title: '??????',
            dataIndex: 'id',
            key: 'id',
            render: (id, record, index) => {
                return index + 1;
            }
        }, {
            title: '????????????',
            dataIndex: 'name',
            key: 'name',
            render: (name, record) => {
                let short = name;
                if (short && short.length > 20) {
                    short = short.substring(0, 20) + " ...";
                }
                return (
                    <Tooltip placement="topLeft" title={name}>
                        {short}
                    </Tooltip>
                );
            },
            sorter: true,
        }, {
            title: '????????????',
            dataIndex: 'protocol',
            key: 'protocol',
            render: (text, record) => {
                const title = `${record['ip'] + ':' + record['port']}`
                return (
                    <Tooltip title={title}>
                        <Tag color={PROTOCOL_COLORS[text]}>{text}</Tag>
                    </Tooltip>
                )
            }
        }, {
            title: '??????',
            dataIndex: 'tags',
            key: 'tags',
            render: tags => {
                if (!isEmpty(tags)) {
                    let tagDocuments = []
                    let tagArr = tags.split(',');
                    for (let i = 0; i < tagArr.length; i++) {
                        if (tags[i] === '-') {
                            continue;
                        }
                        tagDocuments.push(<Tag key={tagArr[i]}>{tagArr[i]}</Tag>)
                    }
                    return tagDocuments;
                }
            }
        }, {
            title: '??????',
            dataIndex: 'active',
            key: 'active',
            render: text => {

                if (text) {
                    return (
                        <Tooltip title='?????????'>
                            <Badge status="processing"/>
                        </Tooltip>
                    )
                } else {
                    return (
                        <Tooltip title='?????????'>
                            <Badge status="error"/>
                        </Tooltip>
                    )
                }
            }
        }, {
            title: '?????????',
            dataIndex: 'ownerName',
            key: 'ownerName'
        }, {
            title: '????????????',
            dataIndex: 'created',
            key: 'created',
            render: (text, record) => {
                return (
                    <Tooltip title={text}>
                        {dayjs(text).fromNow()}
                    </Tooltip>
                )
            },
            sorter: true,
        },
            {
                title: '??????',
                key: 'action',
                render: (text, record) => {

                    const menu = (
                        <Menu>
                            <Menu.Item key="1">
                                <Button type="text" size='small'
                                        disabled={!hasPermission(record['owner'])}
                                        onClick={() => this.update(record.id)}>??????</Button>
                            </Menu.Item>

                            <Menu.Item key="2">
                                <Button type="text" size='small'
                                        disabled={!hasPermission(record['owner'])}
                                        onClick={() => this.copy(record.id)}>??????</Button>
                            </Menu.Item>

                            {isAdmin() ?
                                <Menu.Item key="4">
                                    <Button type="text" size='small'
                                            disabled={!hasPermission(record['owner'])}
                                            onClick={() => {
                                                this.handleSearchByNickname('')
                                                    .then(() => {
                                                        this.setState({
                                                            changeOwnerModalVisible: true,
                                                            selected: record,
                                                        })
                                                        this.changeOwnerFormRef
                                                            .current
                                                            .setFieldsValue({
                                                                owner: record['owner']
                                                            })
                                                    });

                                            }}>???????????????</Button>
                                </Menu.Item> : undefined
                            }


                            <Menu.Item key="5">
                                <Button type="text" size='small'
                                        disabled={!hasPermission(record['owner'])}
                                        onClick={async () => {
                                            await this.handleShowSharer(record);
                                        }}>???????????????</Button>
                            </Menu.Item>

                            <Menu.Divider/>
                            <Menu.Item key="6">
                                <Button type="text" size='small' danger
                                        disabled={!hasPermission(record['owner'])}
                                        onClick={() => this.showDeleteConfirm(record.id, record.name)}>??????</Button>
                            </Menu.Item>
                        </Menu>
                    );

                    return (
                        <div>
                            <Button type="link" size='small'
                                    onClick={() => this.access(record)}>??????</Button>
                
                            <Button type="link" size='small' disabled={record.protocol !== 'ssh'}
                                    onClick={() => this.monitor(record)}>????????????</Button>
                            <Dropdown overlay={menu}>
                                <Button type="link" size='small'>
                                    ?????? <DownOutlined/>
                                </Button>
                            </Dropdown>
                        </div>
                    )
                },
            }
        ];

        if (isAdmin()) {
            columns.splice(6, 0, {
                title: '????????????',
                dataIndex: 'sharerCount',
                key: 'sharerCount',
                render: (text, record, index) => {
                    return <Button type='link' onClick={async () => {
                        await this.handleShowSharer(record, true);
                    }}>{text}</Button>
                }
            });
        }

        const selectedRowKeys = this.state.selectedRowKeys;
        const rowSelection = {
            selectedRowKeys: this.state.selectedRowKeys,
            onChange: (selectedRowKeys, selectedRows) => {
                this.setState({selectedRowKeys});
            },
        };
        const hasSelected = selectedRowKeys.length > 0;

        return (
            <>
                <Content key='page-content' className="site-layout-background page-content">
                    <div style={{marginBottom: 20}}>
                        <Row justify="space-around" align="middle" gutter={24}>
                            <Col span={4} key={1}>
                                <Title level={3}>????????????</Title>
                            </Col>
                            <Col span={20} key={2} style={{textAlign: 'right'}}>
                                <Space>

                                    <Search
                                        ref={this.inputRefOfName}
                                        placeholder="????????????"
                                        allowClear
                                        onSearch={this.handleSearchByName}
                                        style={{width: 200}}
                                    />

                                    <Search
                                        ref={this.inputRefOfIp}
                                        placeholder="??????IP"
                                        allowClear
                                        onSearch={this.handleSearchByIp}
                                        style={{width: 200}}
                                    />

                                    <Select mode="multiple"
                                            allowClear
                                            value={this.state.selectedTags}
                                            placeholder="????????????" onChange={this.handleTagsChange}
                                            style={{minWidth: 150}}>
                                        {this.state.tags.map(tag => {
                                            if (tag === '-') {
                                                return undefined;
                                            }
                                            return (<Select.Option key={tag}>{tag}</Select.Option>)
                                        })}
                                    </Select>

                                    <Select onChange={this.handleSearchByProtocol}
                                            value={this.state.queryParams.protocol ? this.state.queryParams.protocol : ''}
                                            style={{width: 100}}>
                                        <Select.Option value="">????????????</Select.Option>
                                        <Select.Option value="rdp">rdp</Select.Option>
                                        <Select.Option value="ssh">ssh</Select.Option>
                                        <Select.Option value="vnc">vnc</Select.Option>
                                        <Select.Option value="telnet">telnet</Select.Option>
                                    </Select>

                                    <Tooltip title='????????????'>

                                        <Button icon={<UndoOutlined/>} onClick={() => {
                                            this.inputRefOfName.current.setValue('');
                                            this.inputRefOfIp.current.setValue('');
                                            this.setState({
                                                selectedTags: []
                                            })
                                            this.loadTableData({pageIndex: 1, pageSize: 10, protocol: '', tags: ''})
                                        }}>

                                        </Button>
                                    </Tooltip>

                                    <Divider type="vertical"/>

                                    {isAdmin() ?
                                        <Tooltip title="????????????">
                                            <Button type="dashed" icon={<ImportOutlined/>}
                                                    onClick={() => {
                                                        this.setState({
                                                            importModalVisible: true
                                                        })
                                                    }}>

                                            </Button>
                                        </Tooltip> : undefined
                                    }


                                    <Tooltip title="??????">
                                        <Button  icon={<PlusOutlined/>}
                                                onClick={() => this.showModal('????????????', {})}>

                                        </Button>
                                    </Tooltip>


                                    <Tooltip title="????????????">
                                        <Button icon={<SyncOutlined/>} onClick={() => {
                                            this.loadTableData(this.state.queryParams)
                                        }}>

                                        </Button>
                                    </Tooltip>

                                    <Tooltip title="????????????">
                                        <Button type="primary" danger disabled={!hasSelected} icon={<DeleteOutlined/>}
                                                loading={this.state.delBtnLoading}
                                                onClick={() => {
                                                    const content = <div>
                                                        ???????????????????????????<Text style={{color: '#1890FF'}}
                                                                       strong>{this.state.selectedRowKeys.length}</Text>???????????????
                                                    </div>;
                                                    confirm({
                                                        icon: <ExclamationCircleOutlined/>,
                                                        content: content,
                                                        onOk: () => {
                                                            this.batchDelete()
                                                        },
                                                        onCancel() {

                                                        },
                                                    });
                                                }}>

                                        </Button>
                                    </Tooltip>

                                </Space>
                            </Col>
                        </Row>
                    </div>

                    <Table key='assets-table'
                           rowSelection={rowSelection}
                           dataSource={this.state.items}
                           columns={columns}
                           position={'both'}
                           pagination={{
                               showSizeChanger: true,
                               current: this.state.queryParams.pageIndex,
                               pageSize: this.state.queryParams.pageSize,
                               onChange: this.handleChangPage,
                               onShowSizeChange: this.handleChangPage,
                               total: this.state.total,
                               showTotal: total => `?????? ${total} ???`
                           }}
                           loading={this.state.loading}
                           onChange={this.handleTableChange}
                    />

                    {
                        this.state.modalVisible ?
                            <AssetModal
                                visible={this.state.modalVisible}
                                title={this.state.modalTitle}
                                handleOk={this.handleOk}
                                handleCancel={this.handleCancelModal}
                                confirmLoading={this.state.modalConfirmLoading}
                                credentials={this.state.credentials}
                                tags={this.state.tags}
                                model={this.state.model}
                            />
                            : null
                    }

                    {
                        this.state.importModalVisible ?
                            <Modal title="????????????" visible={true}
                                   onOk={() => {
                                       const formData = new FormData();
                                       formData.append("file", this.state.fileList[0]);

                                       let headers = getHeaders();
                                       headers['Content-Type'] = 'multipart/form-data';

                                       axios
                                           .post(server + "/assets/import", formData, {
                                               headers: headers
                                           })
                                           .then((resp) => {
                                               console.log("????????????", resp);
                                               this.setState({
                                                   importModalVisible: false
                                               })
                                               let result = resp.data;
                                               if (result['code'] === 1) {
                                                   let data = result['data'];
                                                   let successCount = data['successCount'];
                                                   let errorCount = data['errorCount'];
                                                   if (errorCount === 0) {
                                                       notification['success']({
                                                           message: '??????????????????',
                                                           description: '???????????????' + successCount + '????????????',
                                                       });
                                                   } else {
                                                       notification['info']({
                                                           message: '??????????????????',
                                                           description: `???????????????${successCount}??????????????????${errorCount}????????????`,
                                                       });
                                                   }
                                               } else {
                                                   notification['error']({
                                                       message: '??????????????????',
                                                       description: result['message'],
                                                   });
                                               }
                                               this.loadTableData();
                                           });
                                   }}
                                   onCancel={() => {
                                       this.setState({
                                           importModalVisible: false
                                       })
                                   }}
                                   okButtonProps={{
                                       disabled: this.state.fileList.length === 0
                                   }}
                            >
                                <Space>
                                    <Upload
                                        maxCount={1}
                                        onRemove={file => {
                                            this.setState(state => {
                                                const index = state.fileList.indexOf(file);
                                                const newFileList = state.fileList.slice();
                                                newFileList.splice(index, 1);
                                                return {
                                                    fileList: newFileList,
                                                };
                                            });
                                        }}
                                        beforeUpload={(file) => {
                                            this.setState(state => ({
                                                fileList: [file],
                                            }));
                                            return false;
                                        }}
                                        fileList={this.state.fileList}
                                    >
                                        <Button icon={<UploadOutlined/>}>??????csv??????</Button>
                                    </Upload>

                                    <Button type="primary" onClick={() => {

                                        let csvString = 'name,ssh,127.0.0.1,22,username,password,privateKey,passphrase,description';
                                        //?????????"\uFEFF"????????????????????????????????????????????????????????????
                                        const blob = new Blob(["\uFEFF" + csvString], {type: 'text/csv;charset=gb2312;'});
                                        let a = document.createElement('a');
                                        a.download = 'sample.csv';
                                        a.href = URL.createObjectURL(blob);
                                        a.click();
                                    }}>
                                        ??????????????????
                                    </Button>
                                </Space>

                            </Modal>
                            : undefined
                    }

                    <Modal title={<Text>???????????????<strong style={{color: '#1890ff'}}>{this.state.selected['name']}</strong>???????????????
                    </Text>}
                           visible={this.state.changeOwnerModalVisible}
                           confirmLoading={this.state.changeOwnerConfirmLoading}

                           onOk={() => {
                               this.setState({
                                   changeOwnerConfirmLoading: true
                               });

                               let changeOwnerModalVisible = false;
                               this.changeOwnerFormRef
                                   .current
                                   .validateFields()
                                   .then(async values => {
                                       let result = await request.post(`/assets/${this.state.selected['id']}/change-owner?owner=${values['owner']}`);
                                       if (result['code'] === 1) {
                                           message.success('????????????');
                                           this.loadTableData();
                                       } else {
                                           message.error(result['message'], 10);
                                           changeOwnerModalVisible = true;
                                       }
                                   })
                                   .catch(info => {

                                   })
                                   .finally(() => {
                                       this.setState({
                                           changeOwnerConfirmLoading: false,
                                           changeOwnerModalVisible: changeOwnerModalVisible
                                       })
                                   });
                           }}
                           onCancel={() => {
                               this.setState({
                                   changeOwnerModalVisible: false
                               })
                           }}
                    >

                        <Form ref={this.changeOwnerFormRef}>

                            <Form.Item name='owner' rules={[{required: true, message: '??????????????????'}]}>
                                <Select
                                    showSearch
                                    placeholder='??????????????????'
                                    onSearch={this.handleSearchByNickname}
                                    filterOption={false}
                                >
                                    {this.state.users.map(d => <Select.Option key={d.id}
                                                                              value={d.id}>{d.nickname}</Select.Option>)}
                                </Select>
                            </Form.Item>
                            <Alert message="?????????????????????????????????????????????????????????" type="info" showIcon/>

                        </Form>
                    </Modal>


                    {
                        this.state.changeSharerModalVisible ?
                            <Modal title={<Text>???????????????<strong
                                style={{color: '#1890ff'}}>{this.state.selected['name']}</strong>???????????????
                            </Text>}
                                   visible={this.state.changeSharerModalVisible}
                                   confirmLoading={this.state.changeSharerConfirmLoading}

                                   onOk={async () => {
                                       this.setState({
                                           changeSharerConfirmLoading: true
                                       });

                                       let changeSharerModalVisible = false;

                                       let result = await request.post(`/resource-sharers/overwrite-sharers`, {
                                           resourceId: this.state.selected['id'],
                                           resourceType: 'asset',
                                           userIds: this.state.selectedSharers
                                       });
                                       if (result['code'] === 1) {
                                           message.success('????????????');
                                           this.loadTableData();
                                       } else {
                                           message.error(result['message'], 10);
                                           changeSharerModalVisible = true;
                                       }

                                       this.setState({
                                           changeSharerConfirmLoading: false,
                                           changeSharerModalVisible: changeSharerModalVisible
                                       })
                                   }}
                                   onCancel={() => {
                                       this.setState({
                                           changeSharerModalVisible: false
                                       })
                                   }}
                                   okButtonProps={{disabled: !hasPermission(this.state.selected['owner'])}}
                            >

                                <Transfer
                                    dataSource={this.state.users}
                                    disabled={!hasPermission(this.state.selected['owner'])}
                                    showSearch
                                    titles={['?????????', '?????????']}
                                    operations={['??????', '??????']}
                                    listStyle={{
                                        width: 250,
                                        height: 300,
                                    }}
                                    targetKeys={this.state.selectedSharers}
                                    onChange={this.handleSharersChange}
                                    render={item => `${item.nickname}`}
                                />
                            </Modal> : undefined
                    }
                </Content>
            </>
        );
    }
}

export default Asset;
