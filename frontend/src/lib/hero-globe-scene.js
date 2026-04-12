import Globe from "globe.gl";
import * as THREE from "three";

export const EARTH_TEXTURE_URL = "/textures/earth.jpg";
const TWO_PI = Math.PI * 2;
const DEFAULT_ELEPHANT_RING = Object.freeze({
  enabled: false,
  count: 28,
  radiusOffset: 2.2,
  minScale: 4.2,
  maxScale: 5.6,
  walkFrameRate: 6,
  opacity: 0.95,
});

function createPixelElephantTexture(frame = 0) {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 24;
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;

  const mainColor = "#8f867d";
  const midColor = "#9b938b";
  const shadowColor = "#6e665f";
  const tuskColor = "#f1dfbe";

  context.fillStyle = mainColor;
  context.fillRect(7, 7, 15, 7); // body
  context.fillRect(4, 9, 4, 3); // tail / hip
  context.fillRect(20, 8, 6, 5); // head
  context.fillRect(23, 6, 3, 4); // trunk root
  context.fillRect(3, 10, 1, 2); // tail tip

  if (frame === 0) {
    context.fillRect(25, 4, 2, 6); // raised trunk
  } else {
    context.fillRect(25, 8, 2, 7); // lowered trunk
  }

  const legHeights = frame === 0 ? [7, 6, 7, 6] : [6, 7, 6, 7];
  const legStarts = [8, 12, 16, 20];
  context.fillStyle = mainColor;
  legStarts.forEach((x, index) => {
    context.fillRect(x, 14, 3, legHeights[index]);
  });

  context.fillStyle = midColor;
  context.fillRect(8, 8, 13, 2);
  context.fillRect(19, 9, 4, 4); // ear

  context.fillStyle = shadowColor;
  context.fillRect(7, 11, 14, 2);
  context.fillRect(8, 18, 3, 2);
  context.fillRect(16, 18, 3, 2);
  context.fillRect(3, 11, 2, 1);

  context.fillStyle = tuskColor;
  context.fillRect(24, 11, 3, 1);
  context.fillRect(24, 12, 2, 1);

  context.fillStyle = "#1d1b1a";
  context.fillRect(22, 9, 1, 1); // eye

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return texture;
}

export class HeroGlobeScene {
  constructor(options = {}) {
    const defaultOptions = {
      backgroundColor: "#020409",
      showStars: true,
      atmosphereColor: "#4da3ff",
      atmosphereAltitude: 0.16,
      idleRotationSpeed: 0.045,
      cameraPosition: { x: 0, y: 8, z: 230 },
      controls: {
        minDistance: 180,
        maxDistance: 280,
      },
    };

    this.options = {
      ...defaultOptions,
      ...options,
      controls: {
        ...defaultOptions.controls,
        ...(options.controls || {}),
      },
      elephantRing: {
        ...DEFAULT_ELEPHANT_RING,
        ...(options.elephantRing || {}),
      },
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
    this.elapsedTime = 0;
    this.elephantRingRoot = null;
    this.elephantGeometry = null;
    this.elephantMaterial = null;
    this.elephantFrameTextures = [];
    this.elephants = [];
    this.walkFrameElapsed = 0;
    this.currentElephantFrame = 0;
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

    if (this.options.elephantRing.enabled && this.earthMesh) {
      this.createElephantRing();
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

  getEarthRadius() {
    const radius = this.earthMesh?.geometry?.parameters?.radius;
    return typeof radius === "number" ? radius : 100;
  }

  createElephantRing() {
    if (
      !this.scene ||
      !this.earthMesh ||
      this.elephantRingRoot ||
      !this.options.elephantRing.enabled
    ) {
      return;
    }

    const settings = this.options.elephantRing;
    const frameA = createPixelElephantTexture(0);
    const frameB = createPixelElephantTexture(1);

    if (!frameA || !frameB) {
      return;
    }

    this.elephantFrameTextures = [frameA, frameB];
    this.elephantGeometry = new THREE.PlaneGeometry(1, 1);
    this.elephantMaterial = new THREE.MeshBasicMaterial({
      map: frameA,
      transparent: true,
      opacity: settings.opacity,
      alphaTest: 0.2,
      side: THREE.DoubleSide,
      toneMapped: false,
      depthWrite: false,
    });

    const root = new THREE.Group();
    root.name = "elephant-ring";

    const parent = this.globeRotationRoot || this.earthMesh || this.scene;
    parent.add(root);

    const ringRadius = this.getEarthRadius() + settings.radiusOffset;
    const up = new THREE.Vector3(0, 1, 0);

    for (let index = 0; index < settings.count; index += 1) {
      const t = index / settings.count;
      const theta = t * TWO_PI;
      const latitude = Math.sin(index * 2.17 + t * Math.PI) * 0.52;
      const cosLatitude = Math.cos(latitude);
      const normal = new THREE.Vector3(
        Math.cos(theta) * cosLatitude,
        Math.sin(latitude),
        Math.sin(theta) * cosLatitude
      ).normalize();

      const elephant = new THREE.Mesh(this.elephantGeometry, this.elephantMaterial);
      const baseScale = THREE.MathUtils.randFloat(settings.minScale, settings.maxScale);
      const aspect = frameA.image.width / frameA.image.height;
      elephant.scale.set(baseScale * aspect, baseScale, 1);
      elephant.position.copy(normal).multiplyScalar(ringRadius);

      const tangent = new THREE.Vector3().crossVectors(up, normal);
      if (tangent.lengthSq() < 1e-6) {
        tangent.set(1, 0, 0);
      }
      tangent.normalize();
      if (index % 2 === 0) {
        tangent.multiplyScalar(-1);
      }
      const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
      const basis = new THREE.Matrix4().makeBasis(tangent, bitangent, normal);
      elephant.quaternion.setFromRotationMatrix(basis);

      root.add(elephant);
      this.elephants.push({
        mesh: elephant,
        normal,
        ringRadius,
        baseScaleX: elephant.scale.x,
        baseScaleY: elephant.scale.y,
        bobStrength: THREE.MathUtils.randFloat(0.2, 0.5),
        bobSpeed: THREE.MathUtils.randFloat(2.2, 3.6),
        walkPhase: Math.random() * TWO_PI,
      });
    }

    this.elephantRingRoot = root;
  }

  updateElephantRing(delta) {
    if (!this.elephants.length || !this.elephantMaterial) {
      return;
    }

    const frameRate = this.options.elephantRing.walkFrameRate;
    if (frameRate > 0) {
      const frameDuration = 1 / frameRate;
      this.walkFrameElapsed += delta;

      if (this.walkFrameElapsed >= frameDuration) {
        this.walkFrameElapsed %= frameDuration;
        this.currentElephantFrame = this.currentElephantFrame === 0 ? 1 : 0;
        this.elephantMaterial.map = this.elephantFrameTextures[this.currentElephantFrame];
        this.elephantMaterial.needsUpdate = true;
      }
    }

    for (const elephant of this.elephants) {
      const stride = Math.sin(
        this.elapsedTime * elephant.bobSpeed + elephant.walkPhase
      );
      const radialOffset = Math.max(0, stride) * elephant.bobStrength;
      const strideScale = 1 + Math.max(0, stride) * 0.04;

      elephant.mesh.position
        .copy(elephant.normal)
        .multiplyScalar(elephant.ringRadius + radialOffset);
      elephant.mesh.scale.set(
        elephant.baseScaleX,
        elephant.baseScaleY * strideScale,
        1
      );
    }
  }

  destroyElephantRing() {
    if (this.elephantRingRoot?.parent) {
      this.elephantRingRoot.parent.remove(this.elephantRingRoot);
    }

    this.elephants = [];
    this.elephantRingRoot = null;

    if (this.elephantGeometry) {
      this.elephantGeometry.dispose();
      this.elephantGeometry = null;
    }

    if (this.elephantMaterial) {
      this.elephantMaterial.dispose();
      this.elephantMaterial = null;
    }

    for (const texture of this.elephantFrameTextures) {
      texture.dispose();
    }
    this.elephantFrameTextures = [];
    this.walkFrameElapsed = 0;
    this.currentElephantFrame = 0;
  }

  update() {
    if (!this.globe) {
      return;
    }

    if (!this.earthMesh) {
      this.earthMesh = this.findEarthMesh();
      this.globeRotationRoot = this.findGlobeRotationRoot();
      if (this.options.elephantRing.enabled && this.earthMesh) {
        this.createElephantRing();
      }
    }

    const delta = this.clock.getDelta();
    this.elapsedTime += delta;

    if (this.globeRotationRoot) {
      this.globeRotationRoot.rotation.y += delta * this.idleRotationSpeed;
    }

    this.updateElephantRing(delta);
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

    if (this.options.elephantRing.enabled && this.earthMesh && !this.elephantRingRoot) {
      this.createElephantRing();
    }
  }

  destroy() {
    this.destroyElephantRing();

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
