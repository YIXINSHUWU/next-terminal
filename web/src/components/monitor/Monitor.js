import React, {Component} from 'react';
import './Monitor.css';
import ReactEcharts from 'echarts-for-react'
import Layout from "antd/lib/layout/layout";
import {Col, Descriptions, Row, Table} from "antd"
import {wsServer} from "../../common/env";
import {getToken} from "../../utils/utils";
import {message} from "antd/es";
import moment from 'moment';
import qs from "qs";


const {Content} = Layout

// Demo
class StatusMonitor extends Component {

    state = {
        webSocket: undefined,
        memoryInfo: [],
        netWorkInfo: {},
        totalRx: "",
        totalTx: "",
        memory: {},
        cpuInfo: []

    }

    constructor(props) {
        super(props)
        this.state.id = props.match.params.id

    }

    componentDidMount() {
        const dataLength = 10

        let param = {
            'X-Auth-Token': getToken()
        }
        let webSocket = new WebSocket(wsServer + '/monitor/' + this.state.id + "?" + qs.stringify(param));
        this.setState({
            webSocket: webSocket
        })
        let pingInterval;
        webSocket.onopen = (e => {
            pingInterval = setInterval(() => {
                webSocket.send("status")
            }, 1000);
        });

        webSocket.onerror = (e) => {
            console.log("err", e)
            message.error("Failed to connect to server.");
        }
        webSocket.onclose = (e) => {
            if (pingInterval) {
                clearInterval(pingInterval);
            }
        }
        let CpuInfo = []

        webSocket.onmessage = (e) => {
            let data = JSON.parse(e.data)
            let baseInfo = data["base_info"]
            let datetime = new Date(data["datetime"])
            let datetimeStr = moment(datetime).format("YYYY-MM-DD HH:mm:ss")
            let singleCpuInfo = {
                "sys": baseInfo['sys_use'],
                "user": baseInfo["user_use"],
                "datetime": datetimeStr
            }
            singleCpuInfo["total"] = singleCpuInfo["sys"] + singleCpuInfo["user"]

            if (this.state.memoryInfo.length < 10) {
                CpuInfo = this.state.memoryInfo
                CpuInfo.push(singleCpuInfo)

            } else {
                CpuInfo = this.state.memoryInfo.slice(1, 10)
                CpuInfo.push(singleCpuInfo)
                this.setState({memoryInfo: CpuInfo})
            }
            let memory = {
                "free": baseInfo["free"],
                "used": baseInfo["used"],
                "cache": baseInfo["cache"]
            }

            this.setState({
                baseInfo: data["base_info"],
                cpuInfo: CpuInfo,
                memory: memory,
                dockerInfo: data["docker"],
                netWorkInfo: data['net_work'],
                upTime: data['base_info']['uptime'],
                onlineUser: data['base_info']["online_user"],
                totalRx: data['net_work']["rx_total"],
                totalTx: data['net_work']["tx_total"]
            })
        }
    }


    componentWillUnmount() {
        let webSocket = this.state.webSocket;
        if (webSocket) {
            webSocket.close()
        }
    }

    parseMemory() {
        let ret = []

        let memory = this.state.memory
        Object.keys(memory).forEach(function (key) {
            ret.push({value: memory[key], name: key})
        })
        return ret
    }

    parseCpuTime() {
        let ret = []
        this.state.cpuInfo.forEach(function (item) {
            ret.push(item['datetime'])
        })
        return ret
    }

    parseCpuData() {
        let ret = {
            user: [],
            sys: [],
            total: [],

        }

        this.state.cpuInfo.forEach(function (item) {
            ret.sys.push(item['sys'])
            ret.user.push(item['user'])
            ret.total.push(item['user'] + item['sys'])
        })
        return ret
    }

    render() {
        let cpuData = this.parseCpuData()
        let baseOption = {
            title: {
                text: 'CPU?????????'
            },
            tooltip: {
                trigger: 'axis'
            },
            legend: {
                data: ['??????', '??????', '??????']
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                containLabel: true
            },
            toolbox: {
                feature: {
                    saveAsImage: {}
                }
            },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: this.parseCpuTime()
            },
            yAxis: {
                type: 'value',
                max: 100
            },
            series: [
                {
                    name: '??????',
                    type: 'line',
                    stack: '??????',
                    data: cpuData["user"]
                },
                {
                    name: '??????',
                    type: 'line',
                    stack: '??????',
                    data: cpuData["sys"]
                },
                {
                    name: '??????',
                    type: 'line',
                    stack: '??????',
                    data: cpuData["total"]
                }

            ]
        };
        const memoryOption = {
            title: {
                text: '??????????????????',
                left: 'center'
            },
            tooltip: {
                trigger: 'item'
            },
            legend: {
                orient: 'vertical',
                left: 'left',
            },
            series: [
                {
                    name: '????????????',
                    type: 'pie',
                    radius: '50%',
                    data: this.parseMemory(),
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowOffsetX: 0,
                            shadowColor: 'rgba(0, 0, 0, 1)'
                        }
                    }
                }
            ]
        };

        const netWorkOption = {
            title: {
                text: '????????????',
                left: 'center'
            },
            tooltip: {
                trigger: 'item'
            },
            legend: {
                orient: 'vertical',
                left: 'left',
            },
            series: [
                {
                    name: "????????????",
                    type: 'pie',
                    radius: '50%',
                    data: [
                        {value: 1048, name: '??????', itemStyle: {"color": "#087cd2"}},
                        {value: 735, name: '??????', itemStyle: {"color": "#7ce0a0"}},
                    ],
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowOffsetX: 0,
                            shadowColor: 'rgba(0, 0, 0, 1)'
                        }
                    }
                }
            ]
        };

        const containerColumns = [
            {
                title: '??????ID',
                dataIndex: 'container_id',
                key: 'container_id',
            },
            {
                title: '????????????',
                dataIndex: 'container_name',
                key: 'container_name',
            },
            {
                title: 'CPU',
                dataIndex: 'cpu_pre',
                key: 'cpu_pre',
            },
            {
                title: '????????????',
                dataIndex: 'mem_usage_limit',
                key: 'mem_usage_limit',
            }
        ];

        return (
            <>
                <Content>
                    <Row gutter={5} justify="start" style={{padding: 18}}>
                        <Col>
                            <Descriptions title="????????????">
                                <Descriptions.Item label="????????????">{this.state.upTime}</Descriptions.Item>
                                <Descriptions.Item label="????????????">{this.state.onlineUser}</Descriptions.Item>
                                <Descriptions.Item label="??????">{this.state.totalTx}</Descriptions.Item>
                                <Descriptions.Item label="??????">{this.state.totalRx}</Descriptions.Item>

                            </Descriptions>
                        </Col>

                    </Row>
                    <Row justify="left" gutter={18} style={{padding: 18}}>

                        <Col span={12}>
                            <ReactEcharts
                                style={{height: 300, width: 500, padding: 10}}
                                notMerge={true}
                                lazyUpdate={true}
                                option={memoryOption}/>

                        </Col>
                        <Col span={12}>
                            <ReactEcharts
                                style={{height: 300, width: 500, padding: 10}}
                                notMerge={true}
                                lazyUpdate={true}
                                option={netWorkOption}/>

                        </Col>
                    </Row>
                    <Row justify="center" style={{paddingTop: 10}}>
                        <Col span={20}>
                            <div className="Status">
                                <ReactEcharts
                                    style={{height: 300, width: 1100, padding: 10}}
                                    notMerge={true}
                                    lazyUpdate={true}
                                    option={baseOption}/>
                            </div>
                        </Col>

                    </Row>

                    <Table columns={containerColumns}
                           dataSource={this.state.dockerInfo}
                           pagination={false}
                           style={{padding: 18}}/>
                </Content>

            </>
        );
    }
}

export default StatusMonitor;
