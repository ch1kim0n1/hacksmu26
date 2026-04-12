import Globe from "globe.gl";
import * as THREE from "three";

export const EARTH_TEXTURE_URL = "/textures/earth.jpg";

export class HeroGlobeScene {
  constructor(options = {}) {
    this.options = {
      backgroundColor: "#020409",
      showStars: true,
      atmosphereColor: "#C4A46C",
      atmosphereAltitude: 0.16,
      idleRotationSpeed: 0.045,
      cameraPosition: { x: 0, y: 8, z: 230 },
      controls: {
        minDistance: 180,
        maxDistance: 280,
      },
      ...options,
    };
    this.container = null;
    this.globe = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.earthMaterial = null;
    this.earthMesh = null;
    this.globeRotationRoot = null;
    this.stars = null;
    this.clock = new THREE.Clock();
    this.idleRotationSpeed = this.options.idleRotationSpeed;
  }

  mount(container) {
    if (!container) {
      throw new Error("HeroGlobeScene.mount requires a container element.");
    }

    this.container = container;
    this.globe = new Globe(container, {
      waitForGlobeReady: true,
      animateIn: true,
    });

    this.globe
      .globeImageUrl(EARTH_TEXTURE_URL)
      .backgroundColor(this.options.backgroundColor)
      .showAtmosphere(true)
      .atmosphereColor(this.options.atmosphereColor)
      .atmosphereAltitude(this.options.atmosphereAltitude)
      .width(container.clientWidth)
      .height(container.clientHeight);

    this.scene = this.globe.scene();
    this.camera = this.globe.camera();
    this.renderer = this.globe.renderer();
    this.controls = this.globe.controls();
    this.earthMaterial = this.globe.globeMaterial();
    this.earthMesh = this.findEarthMesh();
    this.globeRotationRoot = this.findGlobeRotationRoot();

    this.configureRenderer();
    this.configureCamera();
    this.configureControls();
    this.configureLights();
    this.configureEarthMaterial();

    if (
      this.options.backgroundColor === "transparent" ||
      this.options.backgroundColor === "rgba(0,0,0,0)"
    ) {
      this.renderer.setClearColor(0x000000, 0);
    }

    if (this.options.showStars) {
      this.createStarField();
    }
  }

  configureRenderer() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  configureCamera() {
    const { x, y, z } = this.options.cameraPosition;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
  }

  configureControls() {
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.4;
    this.controls.autoRotate = false;
    this.controls.minDistance = this.options.controls.minDistance;
    this.controls.maxDistance = this.options.controls.maxDistance;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(55);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(125);
  }

  configureLights() {
    const ambientLight = new THREE.AmbientLight(0xa8c0dd, 0.9);
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.7);
    const rimLight = new THREE.DirectionalLight(0x5ea2ff, 0.45);

    sunLight.position.set(200, 100, 150);
    rimLight.position.set(-140, -40, -180);

    this.scene.add(ambientLight, sunLight, rimLight);
  }

  configureEarthMaterial() {
    if (!this.earthMaterial) {
      return;
    }

    this.earthMaterial.bumpScale = 4;
    this.earthMaterial.shininess = 11;
    this.earthMaterial.specular = new THREE.Color(0x2a3440);
  }

  createStarField() {
    const starCount = 1400;
    const positions = new Float32Array(starCount * 3);

    for (let index = 0; index < starCount; index += 1) {
      const radius = THREE.MathUtils.randFloat(900, 1800);
      const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);
      const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
      const offset = index * 3;

      positions[offset] = radius * Math.sin(phi) * Math.cos(theta);
      positions[offset + 1] = radius * Math.cos(phi);
      positions[offset + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xcddcff,
      size: 2.2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });

    this.stars = new THREE.Points(geometry, material);
    this.scene.add(this.stars);
  }

  findEarthMesh() {
    let earthMesh = null;

    this.scene?.traverse((object) => {
      if (
        !earthMesh &&
        object.isMesh &&
        object.material === this.earthMaterial &&
        object.geometry?.type === "SphereGeometry"
      ) {
        earthMesh = object;
      }
    });

    return earthMesh;
  }

  findGlobeRotationRoot() {
    if (!this.earthMesh) {
      return null;
    }

    const rotationRootCandidate = this.earthMesh.parent;

    if (!rotationRootCandidate || rotationRootCandidate === this.scene) {
      return this.earthMesh;
    }

    return rotationRootCandidate;
  }

  update() {
    if (!this.globe) {
      return;
    }

    if (!this.earthMesh) {
      this.earthMesh = this.findEarthMesh();
      this.globeRotationRoot = this.findGlobeRotationRoot();
    }

    const delta = this.clock.getDelta();

    if (this.globeRotationRoot) {
      this.globeRotationRoot.rotation.y += delta * this.idleRotationSpeed;
    }

    this.controls?.update();
  }

  resize() {
    if (!this.container || !this.globe || !this.camera || !this.renderer) {
      return;
    }

    const { clientWidth, clientHeight } = this.container;

    this.globe.width(clientWidth).height(clientHeight);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.earthMesh = this.findEarthMesh();
    this.globeRotationRoot = this.findGlobeRotationRoot();
  }

  destroy() {
    if (this.stars) {
      this.scene.remove(this.stars);
      this.stars.geometry.dispose();
      this.stars.material.dispose();
      this.stars = null;
    }

    this.controls?.dispose();
    this.renderer?.dispose();

    if (this.container) {
      this.container.replaceChildren();
    }

    this.container = null;
    this.globe = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.earthMaterial = null;
    this.earthMesh = null;
    this.globeRotationRoot = null;
  }
}
