import * as THREE from 'three';
import{ TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import{ DragControls } from 'three/addons/controls/DragControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

import { VRButton } from 'three/addons/webxr/VRButton.js';

// instantiate a loaders
const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();

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



        /*
        var w1 = -new THREE.Vector3().addVectors(eye.clone().projectOnVector(this.u), this.u.clone().multiplyScalar(0.5)).length(); //left far
        var w2 = this.u.length() + w1; //right far

        var l1 = (this.origin.clone().add(this.u.clone().multiplyScalar(0.5)).add(this.v.clone().multiplyScalar(0.5))).length();

        var h1 = -new THREE.Vector3().addVectors(eye.clone().projectOnVector(this.v), this.v.clone().multiplyScalar(0.5)).length(); //bot far
        var h2 = this.v.length() + h1; //right far //top far
		
        
        var left = (znear * w1) / l1;
        console.log(left);
        var right = (znear * w2) / l1;
        console.log(right);
        var bottom = (znear * h1) / l1;
        console.log(bottom);
        var top = (znear * h2) / l1;
        console.log(top);
        */
        return new THREE.Matrix4().makePerspective(left, right, top, bottom, znear, zfar);
    }
}


var renderer, scene, camera;
var displaySurfaces, displaySurfaceScene, displaySurfaceTargets;
var eyeCenter, eyeScene; 
var orbitControl;
var showScene = true;

export function addGLTFObject(path) {
    gltfLoader.load( path, function ( gltf ) {
        scene.add( gltf.scene );
        }, undefined, function ( error ) {
        console.error( error );
        } );
}

export function addOBJObject(path) {
    // load a resource
    objLoader.load(
        path,
        // called when resource is loaded
        function ( object ) { scene.add( object ); console.log("Object Loaded"); },
        // called when loading is in progresses
        function ( xhr ) { console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' ); },
        // called when loading has errors
        function ( error ) { console.log( 'An error happened' + error); } );
}

function addDragControlToObjects()
{
    var objects = [];
    objects.push(scene.getObjectByName("Teapot"));
    objects.push(eyeScene.getObjectByName("Head"));
    
	//console.log(objects); 
	
    var controls = new DragControls( objects, camera, renderer.domElement );
    controls.addEventListener( 'hoveron', function ( event ) 
		{
            orbitControl.enabled = false;
        } );
    controls.addEventListener( 'hoveroff', function ( event ) 
	{
            orbitControl.enabled = true;
    } );
	controls.addEventListener( 'dragstart', function ( event ) 
		{
            event.object.material.emissive.set( 0xaaaaaa );
        } );
    controls.addEventListener( 'dragend', function ( event ) 
		{
            event.object.material.emissive.set( 0x000000 );
    } );
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

let referenceSpace = null;

async function init(){

    const session = await navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local', 'bounded-floor'], // Example features
    });
    
    // Initialize the reference space for the session
    referenceSpace = await session.requestReferenceSpace('local');
    renderer.xr.setSession(session);
    

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
    var eyeL = eyeScene.getObjectByName("EyeL");
    var eyeR = eyeScene.getObjectByName("EyeR");


    eyeL.position.set();

    eyeR.position.set()
}

var animateVR = function () {
    var gl = renderer.getContext();

    // 1. render scene objects
	renderer.setClearColor(0x808080);
    renderer.clear();
   
    const xrFrame = renderer.xr.getFrame();
    const pose = xrFrame.getViewerPose();

    updateEyePositions();

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

    

    if (!showScene)
        renderer.render(scene, camera);

    // restore state
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000);
    

    // 3. render display surfaces as (textured) quads
    renderer.render(displaySurfaceScene, camera);
	
	// 4. render eyes
    renderer.render(eyeScene, camera);

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
addDragControlToObjects();	// allow some objects to be dragged
animate();