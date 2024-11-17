import * as THREE from 'three';
import{ TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import{ DragControls } from 'three/addons/controls/DragControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'; 
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { OculusHandModel } from 'three/addons/webxr/OculusHandModel.js';
import { OculusHandPointerModel } from 'three/addons/webxr/OculusHandPointerModel.js';


// instantiate a loaders
const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader(); 

class DisplaySurface 
{
    constructor(name, origin, u_vector, v_vector) 
    {
        this.name = name;
        this.origin = origin;
        this.u = u_vector;
        this.v = v_vector;
    }

	viewMatrix(eye)
	{
        var target = new THREE.Vector3().crossVectors(this.v, this.u).normalize();
        target.add(eye);

		var upVector = new THREE.Vector3(0,1,0);	
		var mat = new THREE.Matrix4();
		mat = mat.lookAt(eye, target, upVector); // this lookAt version creates only a rotation matrix
		var translate = new THREE.Matrix4().makeTranslation(-eye.x, -eye.y, -eye.z);
		mat = mat.multiplyMatrices(mat, translate);
		return mat;
	}
	
    projectionMatrix(eye, znear, zfar)
    {
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
        let dist = Math.sqrt(hip*hip-c*c);

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

let materialToApply = null;

function setupDragAndDrop() {
    const dropArea = renderer.domElement;

    dropArea.addEventListener('dragover', handleDragOver, false);
    dropArea.addEventListener('drop', handleFileDrop, false);

    function handleDragOver(event) {
        event.stopPropagation();
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
    }

    function handleFileDrop(event) {
        event.stopPropagation();
        event.preventDefault();

        const files = event.dataTransfer.files; // FileList object.

        // Process each file
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const filename = file.name;
            const extension = filename.split('.').pop().toLowerCase();

            if (extension === 'obj') {
                const url = URL.createObjectURL(file);
                addOBJObject(url); // Use the temporary URL
            } else if (extension === 'gltf') {
                const reader = new FileReader();
                reader.addEventListener('load', function (event) {
                    const contents = event.target.result;
                    addGLTFObject(contents);
                }, false);
                reader.readAsArrayBuffer(file);
            } else if (extension === 'mtl') {
                const url = URL.createObjectURL(file);
                mtlLoader.load(url, (materials) => {
                    materials.preload();
                    materialToApply = materials;
                });
            } else {
                console.error('Unsupported file format:', extension);
            }
        }
    }
}

export function addGLTFObject(path) {
    gltfLoader.load(path, function (gltf) {
        if (materialToApply) {
            gltf.scene.traverse(function (child) {
                if (child.isMesh) {
                    child.material = materialToApply;
                }
            });
        }
        scene.add(gltf.scene);
        addDragControlToObjects([gltf.scene]);
    }, undefined, function (error) {
        console.error(error);
    });
}

export function addOBJObject(path) {
    if (materialToApply) {
        objLoader.setMaterials(materialToApply);
    }
    objLoader.load(
        path,
        function (object) { 
            console.log("Object Loaded");

            let finalObject;
            
            try{
                if (object.type == "Group") {
                    let geometries = [];
                    for (const children of object.children) {
                        geometries.push(children.geometry);
                    }
                    let mergedGeometry = BufferGeometryUtils.mergeBufferGeometries(geometries);

                    let n = (Math.random() * 0xfffff * 1000000).toString(16);
                    let material = new THREE.MeshPhongMaterial( { color: '#' + n.slice(0, 6) } );
                    finalObject = new THREE.Mesh( mergedGeometry, material );
                }
                else {
                    finalObject = object;
                }
                finalObject.geometry.computeBoundingBox();
                var boundingBox = finalObject.geometry.boundingBox;
    
                var size = boundingBox.max.clone().sub(boundingBox.min);
                finalObject.geometry.scale(70/size.x, 70/size.x, 70/size.x);
                
            }
            catch{
                finalObject = object;
            }

            scene.add(finalObject);
            addDragControlToObjects([finalObject]);
        },
        function (xhr) { console.log((xhr.loaded / xhr.total * 100) + '% loaded'); },
        function (error) { console.log('An error happened: ' + error); }
    );
}

let controls = null;
let draggableObjects = [];
function addDragControlToObjects(newObjects)
{
    draggableObjects.push(...newObjects)
    if (controls == null) {
        controls = new DragControls(draggableObjects, camera, renderer.domElement );
        //controls.recursive = false;
        //controls.transformGroup = true;
        controls.addEventListener( 'dragstart', function ( event ) 
        {
                orbitControl.enabled = false;
                if (event.object.type == "Group") {
                    for (const mesh of event.object.children) {
                        mesh.material.emissive.set( 0xaaaaaa );
                    }
                }
                else {
                    event.object.material.emissive.set( 0xaaaaaa );
                }
        } );
        controls.addEventListener( 'dragend', function ( event ) 
        {
                orbitControl.enabled = true;
                if (event.object.type == "Group") {
                    for (const mesh of event.object.children) {
                        mesh.material.emissive.set( 0x000000 );
                    }
                }
                else {
                    event.object.material.emissive.set( 0x000000 );
                }
        } );
    }
}

function createEyeScene()
{
    var IPD = 6.8; 
    eyeCenter = new THREE.Vector3(50, 20, 100);
    // eye positions relative to the head
    var eyeL = new THREE.Vector3( - IPD/2, 10, -6);
    var eyeR = new THREE.Vector3( + IPD/2, 10, -6);

    // eyeCenter = new THREE.Vector3(0, 0, 0);
    // // eye positions relative to the head
    // var eyeL = new THREE.Vector3( 0, 0, 0);
    // var eyeR = new THREE.Vector3( 0, 0, 0);
    
    eyeScene = new THREE.Scene();

    // add sphere representing head
    var geometry = new THREE.SphereGeometry( 10, 32, 22 );
    var material = new THREE.MeshPhongMaterial( { color: 0xaaaaaa } );
    var head = new THREE.Mesh( geometry, material );
    head.name = "Head";
    head.position.set(eyeCenter.x, eyeCenter.y, eyeCenter.z);
    eyeScene.add(head);

    // add spheres representing L/R eyes
    var geometry = new THREE.SphereGeometry( 3, 32, 22 );
    var material = new THREE.MeshPhongMaterial( { color: 0xff0000 } );
    var sphere = new THREE.Mesh( geometry, material );
    sphere.name = "EyeL";
    sphere.position.set(eyeL.x, eyeL.y, eyeL.z);
    head.add(sphere);
	
    var geometry = new THREE.SphereGeometry( 3, 32, 22 );
    var material = new THREE.MeshPhongMaterial( { color: 0x0000ff } );
    var sphere = new THREE.Mesh( geometry, material );
    sphere.name = "EyeR";
    sphere.position.set(eyeR.x, eyeR.y, eyeR.z);
	head.add(sphere);
    
    createLights(eyeScene);
}

function createRenderer()
{
    renderer = new THREE.WebGLRenderer({preserveDrawingBuffer: true});
    renderer.autoClear = false;
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    document.body.appendChild( VRButton.createButton( renderer )).addEventListener("click", init);
    renderer.xr.enabled = true;
}


function handleControllers(){
    const controller1 = renderer.xr.getController(0);
    scene.add(controller1);

    const controller2 = renderer.xr.getController(1);
    scene.add(controller2);

    const controllerModelFactory = new XRControllerModelFactory();

    const controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));

    const hand1 = renderer.xr.getHand(0);
    hand1.add(new OculusHandModel(hand1));
    const handPointer1 = new OculusHandPointerModel(hand1, controller1);
    hand1.add(handPointer1);
    scene.add(hand1);

    const controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));

    const hand2 = renderer.xr.getHand(1);
    hand2.add(new OculusHandModel(hand2));
    const handPointer2 = new OculusHandPointerModel(hand2, controller2);
    hand2.add(handPointer2);
    scene.add(hand2);
}


function init() {
    handleControllers();  
    renderer.setAnimationLoop(animateVR);  
}

function enableOrbitCamera(cam, renderer)
{
    orbitControl = new OrbitControls(cam, renderer.domElement );
    orbitControl.minDistance = 120;
    orbitControl.maxDistance = 50000;
}

function createLights(scn)
{
    var ambientLight = new THREE.AmbientLight(0x888888, 0.4);
    scn.add(ambientLight);
    var pointLight = new THREE.PointLight(0xffffff, 0.8);
	pointLight.position.z += 200;
    scn.add(pointLight);
}

function createScene()
{
    scene = new THREE.Scene();

    var geometry = new TeapotGeometry(40, 15);
    var material = new THREE.MeshPhongMaterial( { color: 0xffffff } );
    var teapot = new THREE.Mesh(geometry, material);
    teapot.name = "Teapot";
    teapot.position.z-=70;
    scene.add( teapot );
                
    createLights(scene);
}

// create a scene with 3D objects representing the display surfaces
function createDisplaySurfaceScene()
{
    displaySurfaceScene = new THREE.Scene();

    // add display surfaces
    for (var [index, displaySurface] of displaySurfaces.entries())
    {
        var origin = displaySurface.origin;
        var u = displaySurface.u;
        var v = displaySurface.v;
  
        var geometry = new THREE.BoxGeometry(u.length(), v.length(), 0.01);
        var material = new THREE.MeshPhongMaterial( {map: displaySurfaceTargets[index].texture} );
        var cube = new THREE.Mesh( geometry, material );
        cube.name = displaySurface.name;
        if (displaySurface.name == "Left")
            cube.rotation.y = Math.PI / 2;
       
		if (displaySurface.name == "Right")
            cube.rotation.y = - Math.PI / 2;
			
		if (displaySurface.name == "Floor")
		{
            cube.rotation.x =  Math.PI / 2;
			cube.rotation.z =  Math.PI ;
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

function createDisplaySurfaceTargets()
{
    const SIZE = 1024;  // texture resolution
    displaySurfaceTargets = [];
    
    for (var v of displaySurfaces)       
        displaySurfaceTargets.push(new THREE.WebGLRenderTarget(SIZE, SIZE));
}


function createCamera()
{
    camera = new THREE.PerspectiveCamera( 75, window.innerWidth/window.innerHeight, 0.1, 10000 );
    camera.position.set( 100, 100, 300 );
    camera.lookAt( 0, 0, 0 );
}

function createDisplaySurfaces()
{
    displaySurfaces = [];
    // FRONT SCREEN
    var frontScreen = new DisplaySurface("Front", 
        new THREE.Vector3(-150.0, -150.0, -150.0), 
        new THREE.Vector3(300.0, 0.0,   0.0), 
        new THREE.Vector3(0.0, 300.0,   0.0));
    displaySurfaces.push(frontScreen);

    // LEFT SCREEN
    var leftScreen = new DisplaySurface("Left",
        new THREE.Vector3(-150.0, -150.0, 150.0), 
        new THREE.Vector3(0.0, 0.0,  -300.0), 
        new THREE.Vector3(0.0, 300.0,   0.0));
    displaySurfaces.push(leftScreen);
	
    // RIGHT SCREEN
    var rightScreen = new DisplaySurface("Right",
        new THREE.Vector3(150.0, -150.0, -150.0), 
        new THREE.Vector3(0.0, 0.0,  300.0), 
        new THREE.Vector3(0.0, 300.0,   0.0));
    displaySurfaces.push(rightScreen);

    var floorScreen = new DisplaySurface("Floor",
        new THREE.Vector3(-150.0, -150.0, 150.0), 
        new THREE.Vector3(300.0, 0.0, 0.0), 
        new THREE.Vector3(0.0, 0.0, -300.0));
    displaySurfaces.push(floorScreen);
	
}

function getLeftEyePosition()
{
    var eye = eyeScene.getObjectByName("EyeL");
    return eye.getWorldPosition(new THREE.Vector3());
}

function getRightEyePosition()
{
    var eye = eyeScene.getObjectByName("EyeR");
    return eye.getWorldPosition(new THREE.Vector3());
}

function cameraFromViewProj(view, proj)
{
	var cam = camera.clone();
    var inv = new THREE.Matrix4();
	inv.copy(view).invert();
	cam.position.set(inv.elements[12], inv.elements[13], inv.elements[14]);
	cam.setRotationFromMatrix(view);
	cam.projectionMatrix = proj.clone();
	return cam;
}

// refresh function
var animate = function () {
    var gl = renderer.getContext();

    // 1. render scene objects
	renderer.setClearColor(0x808080);
    renderer.clear();
    if (showScene)
        renderer.render(scene, camera);
    
    // 2. render scene objects onto a texture, for each target
    for (let [index, displaySurface] of displaySurfaces.entries())
    {
        renderer.setRenderTarget(displaySurfaceTargets[index]);
        renderer.setClearColor(0x404040);
        renderer.clear();

		// left eye on RED channel
        gl.colorMask(1, 0, 0, 0); 
		var eye = getLeftEyePosition();
		var view = displaySurface.viewMatrix(eye);
		var proj = displaySurface.projectionMatrix(eye, 1, 10000);
        var leftCamera = cameraFromViewProj(view, proj);
        renderer.render(scene, leftCamera); 
    
		// right eye on GREEN, BLUE channels
		gl.colorMask(0, 1, 1, 0);
		var eye = getRightEyePosition();
		var view = displaySurface.viewMatrix(eye);
		var proj = displaySurface.projectionMatrix(eye, 1, 10000);
        var rightCamera = cameraFromViewProj(view, proj);
        renderer.clearDepth();
        renderer.render(scene, rightCamera); 
		
        gl.colorMask(1, 1, 1, 0);
    }
    // restore state
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000);
  
    // 3. render display surfaces as (textured) quads
    renderer.render(displaySurfaceScene, camera);
	
	// 4. render eyes
    renderer.render(eyeScene, camera);

    requestAnimationFrame(animate);
};

function updateEyePositions(){
    var head = eyeScene.getObjectByName("Head");

    var translation = new THREE.Vector3(),
    rotation = new THREE.Quaternion(),
    scale = new THREE.Vector3();
    camera.matrixWorld.decompose(translation, rotation, scale);

    head.position.set(translation.x, translation.y, translation.z);
    head.rotation.set(rotation.x, rotation.y, rotation.z);
    head.scale.set(scale.x, scale.y, scale.z);
}

function animateVR(t, frame) {

    if (!frame) {
        // If frame is undefined, request another frame
        const session = renderer.xr.getSession();
        if (session) {
            session.requestAnimationFrame(animateVR);
        }
        return;
    }

    var gl = renderer.getContext();
    var referenceSpace = renderer.xr.getReferenceSpace();
    var pose = frame.getViewerPose(referenceSpace);

    if (pose) {
        // 1. render scene objects
        renderer.setClearColor(0x808080);
        renderer.clear();
        if (showScene) renderer.render(scene, camera);

        updateEyePositions();

        for (let [index, displaySurface] of displaySurfaces.entries()) {
            renderer.setRenderTarget(displaySurfaceTargets[index]);
            renderer.setClearColor(0x404040);
            renderer.clear();

            for (const view of pose.views) {
                const eye = view.eye === 'left' ? getLeftEyePosition() : getRightEyePosition();
                const viewMatrix = displaySurface.viewMatrix(eye);
                const projectionMatrix = displaySurface.projectionMatrix(eye, 1, 10000);

                // Calculate the cameras from view and projection matrices
                const eyeCamera = cameraFromViewProj(viewMatrix, projectionMatrix);

                // left eye on RED channel
                if (view.eye === 'left') {
                    gl.colorMask(1, 0, 0, 0);
                } else {
                    gl.colorMask(0, 1, 1, 0);
                }

                renderer.render(scene, eyeCamera, displaySurfaceTargets[index], true);
                renderer.clearDepth();
            }

            gl.colorMask(1, 1, 1, 0);
        }
        renderer.setRenderTarget(null);
        renderer.setClearColor(0x000000);

        // 3. render display surfaces as (textured) quads
        renderer.render(displaySurfaceScene, camera);

        // 4. render eyes
        renderer.render(eyeScene, camera);
    }

    renderer.setAnimationLoop(animateVR);
};



window.addEventListener( 'keydown', function ( event ) 
{
        switch ( event.code ) {
            case 'KeyL': 
                var eye = getLeftEyePosition();
                camera.position.set(eye.x, eye.y, eye.z); 
                break;
                
            case 'KeyR': 
                var eye = getRightEyePosition();
                camera.position.set(eye.x, eye.y, eye.z); 
                break;
                
            case 'KeyS':
                showScene = !showScene;
                break;
				
			case 'KeyT':
				var viewF = displaySurfaces[0].viewMatrix(new THREE.Vector3(50,20,100));
				var viewL = displaySurfaces[1].viewMatrix(new THREE.Vector3(50,20,100));
				//var viewR = displaySurfaces[2].viewMatrix(new THREE.Vector3(50,20,100));
				//var viewB = displaySurfaces[3].viewMatrix(new THREE.Vector3(50,20,100));
				console.log("View matrices:");
				console.log(viewF);
				console.log(viewL);
				//console.log(viewR);
				//console.log(viewB);
				break;
                
                    
}
});



createRenderer();  			// create WebGL renderer
createDisplaySurfaces();	// Display surfaces
createDisplaySurfaceTargets(); // Textures for the display surfaces
createDisplaySurfaceScene();	// 3D objects for the display surfaces
createEyeScene();	// spheres representing head + eyes
createScene();		// some objects to test (teapot...)
createCamera();		// a third-person camera
enableOrbitCamera(camera, renderer);  // basic camera control
addDragControlToObjects([scene.getObjectByName("Teapot"), eyeScene.getObjectByName("Head")]);	// allow some objects to be dragged
setupDragAndDrop(); 
animate();