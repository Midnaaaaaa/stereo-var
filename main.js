import * as THREE from 'three';
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// Instantiate loaders
const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();

class DisplaySurface {
    constructor(name, origin, u_vector, v_vector) {
        this.name = name;
        this.origin = origin;
        this.u = u_vector;
        this.v = v_vector;
    }

    viewMatrix(eye) {
        var target = new THREE.Vector3().crossVectors(this.v, this.u).normalize();
        target.add(eye);

        var upVector = new THREE.Vector3(0, 1, 0);
        var mat = new THREE.Matrix4();
        mat = mat.lookAt(eye, target, upVector); // this lookAt version creates only a rotation matrix
        var translate = new THREE.Matrix4().makeTranslation(-eye.x, -eye.y, -eye.z);
        mat = mat.multiplyMatrices(mat, translate);
        return mat;
    }

    projectionMatrix(eye, znear, zfar) {
        let lb = eye.clone().sub(this.origin);
        let rb = eye.clone().sub(this.origin.clone().add(this.u));
        let lt = eye.clone().sub(this.origin.clone().add(this.v));

        let widthLeft = lb.clone().projectOnVector(this.u).length();
        let widthRight = rb.clone().projectOnVector(this.u).length();

        let heightTop = lt.clone().projectOnVector(this.v).length();
        let heightBottom = lb.clone().projectOnVector(this.v).length();

        let midLeft = eye.clone().sub(this.origin.clone().add(this.v.clone().multiplyScalar(0.5)));
        let hip = midLeft.length();
        let c = midLeft.clone().projectOnVector(this.u).length();
        let dist = Math.sqrt(hip * hip - c * c);

        let left = -(znear * widthLeft) / dist;
        let right = (znear * widthRight) / dist;
        let bottom = -(znear * heightBottom) / dist;
        let top = (znear * heightTop) / dist;

        return new THREE.Matrix4().makePerspective(left, right, top, bottom, znear, zfar);
    }
}

var renderer, scene, camera;
var displaySurfaces, displaySurfaceScene, displaySurfaceTargets;
var eyeCenter, eyeScene;
var orbitControl;
var showScene = true;

export function addGLTFObject(path) {
    gltfLoader.load(path, function (gltf) {
        scene.add(gltf.scene);
    }, undefined, function (error) {
        console.error(error);
    });
}

export function addOBJObject(path) {
    // load a resource
    objLoader.load(
        path,
        // called when resource is loaded
        function (object) { scene.add(object); console.log("Object Loaded"); },
        // called when loading is in progresses
        function (xhr) { console.log((xhr.loaded / xhr.total * 100) + '% loaded'); },
        // called when loading has errors
        function (error) { console.log('An error happened' + error); });
}

function addDragControlToObjects() {
    var objects = [];
    objects.push(scene.getObjectByName("Teapot"));
    objects.push(eyeScene.getObjectByName("Head"));

    var controls = new DragControls(objects, camera, renderer.domElement);
    controls.addEventListener('hoveron', function (event) {
        orbitControl.enabled = false;
    });
    controls.addEventListener('hoveroff', function (event) {
        orbitControl.enabled = true;
    });
    controls.addEventListener('dragstart', function (event) {
        event.object.material.emissive.set(0xaaaaaa);
    });
    controls.addEventListener('dragend', function (event) {
        event.object.material.emissive.set(0x000000);
    });
}

function createEyeScene() {
    var IPD = 6.8;
    eyeCenter = new THREE.Vector3(50, 20, 50);
    // eye positions relative to the head
    var eyeL = new THREE.Vector3(- IPD / 2, 10, -6);
    var eyeR = new THREE.Vector3(+ IPD / 2, 10, -6);

    eyeScene = new THREE.Scene();

    // add sphere representing head
    var geometry = new THREE.SphereGeometry(10, 32, 22);
    var material = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
    var head = new THREE.Mesh(geometry, material);
    head.name = "Head";
    head.position.set(eyeCenter.x, eyeCenter.y, eyeCenter.z);
    eyeScene.add(head);

    // add spheres representing L/R eyes
    geometry = new THREE.SphereGeometry(3, 32, 22);
    material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    var sphere = new THREE.Mesh(geometry, material);
    sphere.name = "EyeL";
    sphere.position.set(eyeL.x, eyeL.y, eyeL.z);
    head.add(sphere);

    geometry = new THREE.SphereGeometry(3, 32, 22);
    material = new THREE.MeshPhongMaterial({ color: 0x0000ff });
    sphere = new THREE.Mesh(geometry, material);
    sphere.name = "EyeR";
    sphere.position.set(eyeR.x, eyeR.y, eyeR.z);
    head.add(sphere);

    createLights(eyeScene);
}

function createRenderer() {
    renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.autoClear = false;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    document.body.appendChild(VRButton.createButton(renderer));
}

function enableOrbitCamera(cam, renderer) {
    orbitControl = new OrbitControls(cam, renderer.domElement);
    orbitControl.minDistance = 120;
    orbitControl.maxDistance = 50000;
}

function createLights(scn) {
    var ambientLight = new THREE.AmbientLight(0x888888, 0.4);
    scn.add(ambientLight);
    var pointLight = new THREE.PointLight(0xffffff, 0.8);
    pointLight.position.z += 200;
    scn.add(pointLight);
}

function createScene() {
    scene = new THREE.Scene();

    var geometry = new TeapotGeometry(40, 15);
    var material = new THREE.MeshPhongMaterial({ color: 0xffffff });
    var teapot = new THREE.Mesh(geometry, material);
    teapot.name = "Teapot";
    teapot.position.z -= 70;
    scene.add(teapot);

    createLights(scene);
}

// create a scene with 3D objects representing the display surfaces
function createDisplaySurfaceScene() {
    displaySurfaceScene = new THREE.Scene();

    // add display surfaces
    for (var [index, displaySurface] of displaySurfaces.entries()) {
        var origin = displaySurface.origin;
        var u = displaySurface.u;
        var v = displaySurface.v;

        var geometry = new THREE.BoxGeometry(u.length(), v.length(), 0.01);
        var material = new THREE.MeshPhongMaterial({ map: displaySurfaceTargets[index].texture });
        var cube = new THREE.Mesh(geometry, material);
        cube.name = displaySurface.name;
        if (displaySurface.name == "Left")
            cube.rotation.y = Math.PI / 2;

        if (displaySurface.name == "Right")
            cube.rotation.y = - Math.PI / 2;

        if (displaySurface.name == "Floor") {
            cube.rotation.x = Math.PI / 2;
            cube.rotation.z = Math.PI;
        }

        var uHalf = u.clone().multiplyScalar(0.5);
        var vHalf = v.clone().multiplyScalar(0.5);
        var center = new THREE.Vector3().addVectors(origin, uHalf);
        center.add(vHalf);
        cube.position.set(center.x, center.y, center.z);

        displaySurfaceScene.add(cube);
    }

    createLights(displaySurfaceScene);
}

function createDisplaySurfaceTargets() {
    const SIZE = 1024;  // texture resolution
    displaySurfaceTargets = [];

    for (var v of displaySurfaces)
        displaySurfaceTargets.push(new THREE.WebGLRenderTarget(SIZE, SIZE));
}

function createCamera() {
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    camera.position.set(100, 100, 300);
    camera.lookAt(0, 0, 0);
}

function animate() {
    renderer.setAnimationLoop(render);
}

function render() {
    renderer.clear();

    // Render display surfaces
    for (var [index, displaySurface] of displaySurfaces.entries()) {
        renderer.setRenderTarget(displaySurfaceTargets[index]);
        renderer.clear();

        var displaySurfaceEyePos = eyeCenter.clone();
        var viewMatrix = displaySurface.viewMatrix(displaySurfaceEyePos);
        var projectionMatrix = displaySurface.projectionMatrix(displaySurfaceEyePos, 1, 10000);

        camera.projectionMatrix.copy(projectionMatrix);
        camera.matrix.copy(viewMatrix);
        camera.matrix.decompose(camera.position, camera.quaternion, camera.scale);

        renderer.render(scene, camera);
    }

    renderer.setRenderTarget(null);
    renderer.render(displaySurfaceScene, camera);
    if (showScene)
        renderer.render(eyeScene, camera);
}

function setupCAVE() {
    displaySurfaces = [];
    displaySurfaces.push(new DisplaySurface("Floor", new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 0, 0), new THREE.Vector3(0, 0, -100)));
    displaySurfaces.push(new DisplaySurface("Front", new THREE.Vector3(0, 100, -100), new THREE.Vector3(100, 0, 0), new THREE.Vector3(0, 100, 0)));
    displaySurfaces.push(new DisplaySurface("Left", new THREE.Vector3(0, 0, -100), new THREE.Vector3(0, 100, 0), new THREE.Vector3(0, 0, 100)));
    displaySurfaces.push(new DisplaySurface("Right", new THREE.Vector3(100, 0, 0), new THREE.Vector3(0, 100, 0), new THREE.Vector3(0, 0, 100)));
}

window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

setupCAVE();
createRenderer();
createCamera();
enableOrbitCamera(camera, renderer);
createScene();
createEyeScene();
createDisplaySurfaceTargets();
createDisplaySurfaceScene();
animate();
addDragControlToObjects();