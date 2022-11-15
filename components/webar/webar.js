import WuJianAR from '../../libs/wujian-ar';
import ThreeHelper from '../../libs/three-helper';

const sys = wx.getSystemInfoSync();
Component({
    properties: {
        config: Object,
    },
    data: {
        width: 0,
        height: 0,
        showWelcome: true,
        scanning: false,
        videoUrl: '',
        debug: '',
    },
    wujianAR: null,
    threeHelper: null,
    marker: '',
    lifetimes: {
        detached() {
            try {
                if (this.threeHelper) {
                    this.threeHelper.dispose();
                }
                if (this.wujianAR) {
                    this.wujianAR.dispose();
                }
            } catch (err) {
                console.info(err);
            }
        },
        ready: async function () {
            this.setData({
                width: sys.windowWidth,
                height: sys.windowHeight,
            });

            this.wujianAR = new WuJianAR(this.properties.config, await this.querySelector('#camera'));
            if (!this.wujianAR.isSupport()) {
                wx.showToast({ icon: 'none', title: '你的微信不支持跟踪' });
            } else {
                this.bindEvent();
            }

            this.threeHelper = new ThreeHelper(await this.querySelector('#three'));
        },
    },

    methods: {
        showScanning() {
            this.setData({ scanning: true });
        },
        hideScanning() {
            this.setData({ scanning: false });
        },
        showLoading(title) {
            wx.showLoading({ title });
        },
        hideLoading() {
            wx.hideLoading();
        },
        back() {
            this.stopSearch();
            this.wujianAR.resetTracking();
            this.threeHelper.reset();

            this.setData({ showWelcome: true, videoUrl: '' });
        },
        stopSearch() {
            this.wujianAR.stopSearch();
            this.hideScanning();
        },

        scan() {
            this.setData({ showWelcome: false });
            this.showScanning();

            this.wujianAR.startSearch();
        },
        save() {
            wx.saveImageToPhotosAlbum({
                filePath: "../images/model.jpg",
                success: res => wx.showToast({ title: "已保存到相册", icon: "none" }),
                fail: res => wx.showToast({ title: "保存失败", icon: "none" }),
            });
        },

        // 视频加载成功，加入跟踪
        loadVideoMeta: async function (e) {
            const video = await this.queryContext('#video');
            const videoCanvas = await this.querySelector('#videoCanvas');
            const { width, height } = e.detail;
            this.threeHelper.loadVideo({ video, videoCanvas, width, height });

            this.hideLoading();

            this.wujianAR.loadMarkerByUrl(this.marker).then((markerId) => {
                video.play();
                wx.showToast({ title: '请将相机对着识别图' });
            }).catch(err => {
                console.info(err);
                wx.showToast({ icon: 'error', title: '识别图加载错误' });
            });
        },
        loadVideoError: function (e) {
            wx.showToast({ icon: 'error', title: '视频播放失败' });
        },
        loadVideoWaiting: function () {
            // wx.showToast({ icon: 'none', title: '视频缓冲，请等待' });
        },
        playVideo: async function () {
            this.queryContext('#video').then(video => {
                video.play();
            }).catch(err => {
                console.info(err);
            });
        },
        pauseVideo: async function () {
            this.queryContext('#video').then(video => {
                video.pause();
            }).catch(err => {
                console.info(err);
            });
        },

        querySelector(target) {
            return new Promise((resolve, reject) => {
                wx.createSelectorQuery()
                    .in(this)
                    .select(target)
                    .node(res => {
                        if (res == null) {
                            return reject(`未找到${target}`);
                        }
                        return resolve(res.node);
                    }).exec();
            });
        },
        queryContext(target) {
            return new Promise((resolve, reject) => {
                wx.createSelectorQuery()
                    .in(this)
                    .select(target)
                    .context(res => {
                        if (res == null) {
                            return reject(`未找到${target}`);
                        }
                        return resolve(res.context);
                    }).exec();
            });
        },
        bindEvent() {
            this.wujianAR.initTracking();
            this.wujianAR.startTracking().then(() => {
                this.wujianAR.on(this.wujianAR.eventNameCamera, (camera) => {
                    this.threeHelper.updateCamera(camera);
                });

                // 识别到目标
                this.wujianAR.on(this.wujianAR.eventNameFound, (anchor) => {
                    console.info('found');
                    this.threeHelper.anchor.visible = true;
                    this.threeHelper.updateAnchor(anchor);

                    this.playVideo();
                });
                // 跟踪目标
                this.wujianAR.on(this.wujianAR.eventNameUpdate, (anchor) => {
                    this.threeHelper.updateAnchor(anchor);
                });
                // 跟踪丢失
                this.wujianAR.on(this.wujianAR.eventNameLost, (anchor) => {
                    this.threeHelper.anchor.visible = false;
                    this.pauseVideo();
                });
                this.wujianAR.on(this.wujianAR.eventNameSearch, (rs) => {
                    this.stopSearch();

                    const setting = JSON.parse(rs.data.brief);
                    this.marker = rs.data.image;

                    if (setting.modelUrl) {
                        this.loadModel(setting);
                    } else if (setting.videoUrl) {
                        this.loadVideo(setting);
                    }
                });
            }).catch(err => {
                console.info(err);
            });
        },
        // 加载模型
        loadModel(setting) {
            this.showLoading('模型加载中');

            this.threeHelper.loadModel(setting).then(() => {
                this.wujianAR.loadMarkerByUrl(this.marker).then(() => {
                    this.hideLoading();
                    wx.showToast({ title: '请将相机对着识别图' });
                }).catch(err => {
                    this.hideLoading();
                    console.info(err);
                    wx.showToast({ icon: 'error', title: '识别图加载错误' });
                });
            }).catch(err => {
                console.error(err);
                wx.showToast({ icon: 'error', title: '模型加载错误' });
            });
        },
        // 加载视频
        loadVideo(setting) {
            this.showLoading('视频加载中');
            this.setData({ videoUrl: setting.videoUrl });
        }
    },
});