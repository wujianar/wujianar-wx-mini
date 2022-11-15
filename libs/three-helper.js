import { createScopedThreejs } from './three';
import { registerGLTFLoader } from './gltf-loader';

export default class ThreeHelper {
    onRender = (ts) => { };
    timer = 0;

    videoFps = 30;
    videoSize = { width: 1920, height: 1080 };
    frameSize = { width: 512, height: 1080 * (512 / 1920) };
    videoFrame = null;
    isAddedVideo = false;
    videoConfig = {};

    constructor(canvas) {
        this.canvas = canvas;
        this.THREE = createScopedThreejs(canvas);
        registerGLTFLoader(this.THREE);

        this.camera = new this.THREE.PerspectiveCamera(70, canvas.width / canvas.height, 1, 1000);
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(new this.THREE.Vector3(0, 3, 0));

        this.scene = new this.THREE.Scene();
        this.scene.add(new this.THREE.AmbientLight(0xFFFFFF, 2));

        this.renderer = new this.THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(canvas.width, canvas.height);
        this.renderer.setPixelRatio(wx.getSystemInfoSync().pixelRatio);

        this.clock = new this.THREE.Clock();
        this.mixers = [];

        this.anchor = new this.THREE.Object3D();
        this.anchor.visible = false;
        this.anchor.matrixAutoUpdate = false;
        this.scene.add(this.anchor);

        this.render();
    }

    render() {
        this.canvas.requestAnimationFrame(() => {
            this.render();
        });

        this.renderer.render(this.scene, this.camera);
        for (const mixer of this.mixers) {
            mixer.update(this.clock.getDelta());
        }

        this.onRender.call(this, this.clock.getDelta());

        if (this.texture) {
            this.texture.needsUpdate = true;
        }
    }

    updateCamera(vkCamera) {
        try {
            this.camera.matrixAutoUpdate = false;
            this.camera.matrixWorldInverse.fromArray(vkCamera.viewMatrix);
            this.camera.matrixWorld.getInverse(this.camera.matrixWorldInverse);

            const projectionMatrix = vkCamera.getProjectionMatrix(0.1, 1000);
            this.camera.projectionMatrix.fromArray(projectionMatrix);
            this.camera.projectionMatrixInverse.getInverse(this.camera.projectionMatrix);
        } catch (err) {
            console.info(err);
        }
    }

    updateAnchor(a) {
        this.anchor.matrix.fromArray(a.transform);
    }

    loadModel(setting) {
        return new Promise((resolve, reject) => {
            const loader = new this.THREE.GLTFLoader();
            loader.load(setting.modelUrl, (object) => {
                const model = object.scene;
                model.scale.setScalar(setting.scale);
                model.name = 'player';
                this.anchor.add(model);

                if (object.animations.length > 0) {
                    model.mixer = new this.THREE.AnimationMixer(model);
                    this.mixers.push(model.mixer);
                    model.mixer.clipAction(object.animations[0]).play();
                }
                resolve();
            }, () => {
            }, (err) => {
                reject(err);
            });
        });
    }

    disposeModel() {
        try {
            const model = this.scene.getObjectByName('player');
            if (model) {
                this.mixers.pop();
                this.anchor.remove(model);
            }
        } catch (err) {
            console.info(err);
        }
    }

    loadVideo(opts) {
        if (this.isAddedVideo) {
            return;
        }

        this.videoConfig = opts;

        this.isAddedVideo = true;
        this.videoSize = { width: opts.width, height: opts.height };
        this.frameSize.height = opts.height * (this.frameSize.width / opts.width);

        // 真机不支持，等待ing。
        // const videoCanvas = wx.createOffscreenCanvas({ type: '2d' });

        opts.videoCanvas.width = this.frameSize.width;
        opts.videoCanvas.height = this.frameSize.height;
        const ctx = opts.videoCanvas.getContext('2d');

        this.timer = setInterval(() => {
            try {
                ctx.drawImage(opts.video, 0, 0, opts.width, opts.height, 0, 0, this.frameSize.width, this.frameSize.height);
                let imgData = ctx.getImageData(0, 0, this.frameSize.width, this.frameSize.height);
                let data = new Uint8Array(imgData.data);
                if (this.videoFrame === null) {
                    this.videoFrame = new Uint8Array(data.length);
                    this.addPlane();
                }
                this.videoFrame.set(data);
            } catch (err) {
                console.info(err);
            }
        }, this.videoFps);
    }

    disposeVideo() {
        try {
            this.isAddedVideo = false;
            const model = this.scene.getObjectByName('player');
            if (model) {
                this.anchor.remove(model);
            }

            if (this.texture) {
                this.texture.dispose();
                this.texture = null;
            }
            this.plane = null;
            clearInterval(this.timer);
            this.videoFrame = null;
            if (this.videoConfig.video) {
                this.videoConfig.video.stop();
            }
        } catch (err) {
            console.info(err);
        }
    }

    addPlane() {
        try {
            this.texture = new this.THREE.DataTexture(this.videoFrame, this.frameSize.width, this.frameSize.height);
            this.texture.minFilter = this.THREE.LinearFilter;
            this.texture.wrapS = this.THREE.ClampToEdgeWrapping;
            this.texture.wrapT = this.THREE.ClampToEdgeWrapping;

            const geometry = new this.THREE.PlaneGeometry(1, this.videoSize.height / this.videoSize.width);
            const material = new this.THREE.MeshBasicMaterial({ side: this.THREE.BackSide, map: this.texture });
            this.plane = new this.THREE.Mesh(geometry, material);

            this.plane.rotation.x = Math.PI / 2;
            this.plane.name = 'player';
            this.anchor.add(this.plane);
        } catch (err) {
            console.info(err);
        }
    }

    dispose() {
        this.reset();

        if (this.scene) {
            this.scene.dispose();
            this.scene = null;
        }
        if (this.camera) {
            this.camera.dispose();
            this.camera = null;
        }
        if (this.mixers) {
            this.mixers = null;
        }
        if (this.clock) {
            this.clock = null;
        }
        if (this.THREE) {
            this.THREE = null;
        }
    }

    reset() {
        this.disposeModel();
        this.disposeVideo();
    }
}