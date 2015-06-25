var camera, scene, renderer;
var win_width, win_height;
var rtt_target;
var rtt_width, rtt_height;
var controls;

init();
init_geometry();
animate();

function init() {

    win_width = 40;//window.innerWidth;
    win_height = 40;//window.innerHeight;
    rtt_width = 4;
    rtt_height = 4;

    var fov = 40,
        aspect = win_width / win_height,
        near = 0.1,
        far = 100000;

//    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera = new THREE.OrthographicCamera(win_width / -2, win_width / 2, 
                                          win_height / 2, win_height / -2,
                                          near, far);
    //camera = new THREE.CombinedCamera(win_width, win_height, fov, near, far, near, far);
    //camera.toOrthographic();
    camera.position.z = 1000;

    controls = new THREE.OrbitControls( camera );
    controls.damping = 0.2;
    controls.addEventListener( 'change', render );

    scene = new THREE.Scene();

    rtt_target = new THREE.WebGLRenderTarget( rtt_width, rtt_height );
    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setClearColor( 0x010203 );
    renderer.setSize(win_width, win_height);

    document.body.appendChild(renderer.domElement);
}

function init_geometry() {

    var geometry = new THREE.BoxGeometry( 100, 100, 100 );
    var material = new THREE.MeshBasicMaterial( {color: 0xffff00} );
    var mesh = new THREE.Mesh( geometry, material );
    mesh.position.y -= 10;
    scene.add(mesh);
  var num_points = 0;
  for (var i = 0; i < num_points; ++i) {
    var geometry = new THREE.CylinderGeometry( 0, 100, 100, 32, 1, true );
    var material = new THREE.MeshBasicMaterial( {color: i} );
    var mesh = new THREE.Mesh( geometry, material );
    mesh.position.x += win_width*(Math.random() - 0.5);
    mesh.position.y += win_height*(Math.random() - 0.5);
    mesh.rotation.x += Math.PI/2;
    scene.add(mesh);
  }
}

function animate() {
    //requestAnimationFrame(animate);
    controls.update();
    render();
    render_to_target();
}

function render_to_target() {
  renderer.render( scene, camera, rtt_target, true );

  var gl = renderer.getContext();
  var pixels = new Uint8Array(rtt_width*rtt_height*4);
  gl.readPixels( 0, 0, rtt_width, rtt_height, gl.RGBA, gl.UNSIGNED_BYTE, pixels );

  for ( var i = 0; i < rtt_width; ++i ) {
    for ( var j = 0; j < rtt_height; ++j ) {
      var line = "";
      for ( var k = 0; k < 4; ++k ) {
        line += pixels[k + 4 * (j + rtt_height * i)] + " ";
      }
      console.log(line);
    }
    console.log(" ");
  }

}

function render() {
  renderer.render( scene, camera );
}
