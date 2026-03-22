import "./style.css";
import { SIM_SIZE, WORKGROUP_SIZE } from "./constants.ts";

let startTime: number;
let lastFrameTime: number;

let mouseDown = false;
let mousePos = { x: 0, y: 0 };
let mouseDelta = { x: 0, y: 0 };

const rectSDF = (x: number, y: number, halfW: number, halfH: number) => {
    const cx = SIM_SIZE / 2;
    const cy = SIM_SIZE / 2;
    const dx = Math.abs(x - cx) - halfW;
    const dy = Math.abs(y - cy) - halfH;
    return Math.max(dx, dy);
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
};

const FADE_WIDTH = 5; // pixels over which the border fades

const getInitialVelocity = (x: number, y: number) => {
    const halfW = SIM_SIZE / 2 - SIM_SIZE / 3;
    const halfH = SIM_SIZE / 2 - (SIM_SIZE / 10) * 4;
    const d = rectSDF(x, y, halfW, halfH);

    const intensity = 1 - smoothstep(-FADE_WIDTH, 0, d);
    return { x: 0.0, y: intensity };
};

const startTextureData = new Float16Array(SIM_SIZE * SIM_SIZE * 4); // 4 channels (rgba)
for (let y = 0; y < SIM_SIZE; y++) {
    for (let x = 0; x < SIM_SIZE; x++) {
        const i = (y * SIM_SIZE + x) * 4;
        const val = getInitialVelocity(x, y);
        startTextureData[i] = val.x; // r // right
        startTextureData[i + 1] = val.y; // g // up
        startTextureData[i + 2] = 0.0; // b // unused
        startTextureData[i + 3] = 1.0; // a // unused
    }
}

// getting the HTML canvas
const canvas: HTMLCanvasElement = document.getElementById(
    "GLCanvas",
)! as HTMLCanvasElement;

// SETTING UP MOUSE MOVEMENT
canvas.addEventListener("mousedown", () => {
    mouseDown = true;
});
canvas.addEventListener("mouseup", () => {
    mouseDown = false;
    mouseDelta = { x: 0, y: 0 };
});
canvas.addEventListener("mousemove", (e) => {
    // if (!mouseDown) return;
    const rect = canvas.getBoundingClientRect();

    mouseDelta = { x: e.movementX / rect.width, y: -e.movementY / rect.width };
    mousePos = { x: e.offsetX / rect.width, y: 1 - e.offsetY / rect.width };
});

// MAIN SETUP FOR RENDERING
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();

if (!device) {
    throw Error("No gpu detected");
}

const context = canvas.getContext("webgpu");
if (!context) {
    throw Error("Error getting the context");
}

const devicePixelRatio = window.devicePixelRatio;
canvas.width = canvas.clientWidth * devicePixelRatio;
canvas.height = canvas.clientHeight * devicePixelRatio;

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device: device,
    format: presentationFormat,
});
// END MAIN SETUP FOR RENDERING

// LOAD SHADERS
const loadWGSL = async (path: string) => {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load shader: ${path}`);
    }
    return response.text();
};

const loadShaderModule = async (path: string): Promise<GPUShaderModule> => {
    const code = await loadWGSL(path);
    return device.createShaderModule({ code });
};

const vertexShader = await loadShaderModule("shaders/vertex.wgsl");
const fragmentShader = await loadShaderModule("shaders/fragment.wgsl");
const advectionShader = await loadShaderModule("shaders/advection.wgsl");
const divergenceShader = await loadShaderModule("shaders/divergence.wgsl");
const pressureShader = await loadShaderModule("shaders/pressure.wgsl");
const projectionShader = await loadShaderModule("shaders/projection.wgsl");
// END LOAD SHADERS

// BUFFERS
const uniformBuffer = device.createBuffer({
    label: "Uniform Buffer",
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const velocityTextureBuffers = [
    device.createTexture({
        label: "Velocity Texture Buffer A",
        size: [SIM_SIZE, SIM_SIZE],
        format: "rgba16float",
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_DST,
    }),
    device.createTexture({
        label: "Velocity Texture Buffer B",
        size: [SIM_SIZE, SIM_SIZE],
        format: "rgba16float",
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_SRC |
            GPUTextureUsage.COPY_DST,
    }),
];

const divergenceTextureBuffers = [
    device.createTexture({
        label: "Divergence Texture Buffer A",
        size: [SIM_SIZE, SIM_SIZE],
        format: "rgba16float",
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_DST,
    }),
    device.createTexture({
        label: "Divergence Texture Buffer B",
        size: [SIM_SIZE, SIM_SIZE],
        format: "rgba16float",
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_DST,
    }),
];

const pressureTextureBuffers = [
    device.createTexture({
        label: "Pressure Texture Buffer A",
        size: [SIM_SIZE, SIM_SIZE],
        format: "rgba16float",
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_DST,
    }),
    device.createTexture({
        label: "Pressure Texture Buffer B",
        size: [SIM_SIZE, SIM_SIZE],
        format: "rgba16float",
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_DST,
    }),
];

const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
});
// END BUFFERS

// BIND GROUP LAYOUTS

// Advection: reads velocity[0], writes velocity[1], sampler, uniforms
const advectionBindGroupLayout = device.createBindGroupLayout({
    label: "Advection Bind Group Layout",
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            texture: { sampleType: "float" },
        },
        {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: { format: "rgba16float", access: "write-only" },
        },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, sampler: {} },
        {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: "uniform" },
        },
    ],
});

// Divergence: reads velocity[1], writes divergence[0]
const divergenceBindGroupLayout = device.createBindGroupLayout({
    label: "Divergence Bind Group Layout",
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            texture: { sampleType: "float" },
        },
        {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: { format: "rgba16float", access: "write-only" },
        },
    ],
});

// Pressure: reads divergence[0] + pressure[i%2], writes pressure[(i+1)%2]
const pressureBindGroupLayout = device.createBindGroupLayout({
    label: "Pressure Bind Group Layout",
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            texture: { sampleType: "float" },
        },
        {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            texture: { sampleType: "float" },
        },
        {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: { format: "rgba16float", access: "write-only" },
        },
    ],
});

// Projection: reads velocity[1] + pressure, writes velocity[0]
const projectionBindGroupLayout = device.createBindGroupLayout({
    label: "Projection Bind Group Layout",
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            texture: { sampleType: "float" },
        },
        {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            texture: { sampleType: "float" },
        },
        {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: { format: "rgba16float", access: "write-only" },
        },
    ],
});

const renderBindGroupLayout = device.createBindGroupLayout({
    label: "Render Bind Group Layout",
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float" },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
});
// END BIND GROUP LAYOUTS

// PIPELINES SETUP
const renderPipelineLayout = device.createPipelineLayout({
    label: "Render Pipeline Layout",
    bindGroupLayouts: [renderBindGroupLayout],
});

const advectionComputePipeline = device.createComputePipeline({
    label: "Advection Compute Pipeline",
    layout: device.createPipelineLayout({
        bindGroupLayouts: [advectionBindGroupLayout],
    }),
    compute: { module: advectionShader, entryPoint: "advectionStep" },
});

const divergenceComputePipeline = device.createComputePipeline({
    label: "Divergence Compute Pipeline",
    layout: device.createPipelineLayout({
        bindGroupLayouts: [divergenceBindGroupLayout],
    }),
    compute: { module: divergenceShader, entryPoint: "divergenceStep" },
});

const pressureComputePipeline = device.createComputePipeline({
    label: "Pressure Compute Pipeline",
    layout: device.createPipelineLayout({
        bindGroupLayouts: [pressureBindGroupLayout],
    }),
    compute: { module: pressureShader, entryPoint: "pressureStep" },
});

const projectionComputePipeline = device.createComputePipeline({
    label: "Projection Compute Pipeline",
    layout: device.createPipelineLayout({
        bindGroupLayouts: [projectionBindGroupLayout],
    }),
    compute: { module: projectionShader, entryPoint: "projectionStep" },
});

const renderPipeline = device.createRenderPipeline({
    label: "Render Pipeline",
    layout: renderPipelineLayout,
    vertex: {
        module: vertexShader,
        buffers: [],
    },
    fragment: {
        module: fragmentShader,
        targets: [{ format: presentationFormat }],
    },
});

// BIND GROUPS

// Advection: reads velocity[0], writes velocity[1]
const advectionBindGroup = device.createBindGroup({
    label: "Advection Bind Group",
    layout: advectionBindGroupLayout,
    entries: [
        { binding: 0, resource: velocityTextureBuffers[0].createView() },
        { binding: 1, resource: velocityTextureBuffers[1].createView() },
        { binding: 2, resource: sampler },
        { binding: 3, resource: { buffer: uniformBuffer } },
    ],
});

// Divergence: reads velocity[1], writes divergence[0]
const divergenceBindGroup = device.createBindGroup({
    label: "Divergence Bind Group",
    layout: divergenceBindGroupLayout,
    entries: [
        { binding: 0, resource: velocityTextureBuffers[1].createView() },
        { binding: 1, resource: divergenceTextureBuffers[0].createView() },
    ],
});

// Pressure: two bind groups for ping-ponging
const pressureBindGroups = [
    device.createBindGroup({
        label: "Pressure Bind Group A",
        layout: pressureBindGroupLayout,
        entries: [
            { binding: 0, resource: divergenceTextureBuffers[0].createView() },
            { binding: 1, resource: pressureTextureBuffers[0].createView() },
            { binding: 2, resource: pressureTextureBuffers[1].createView() },
        ],
    }),
    device.createBindGroup({
        label: "Pressure Bind Group B",
        layout: pressureBindGroupLayout,
        entries: [
            { binding: 0, resource: divergenceTextureBuffers[0].createView() },
            { binding: 1, resource: pressureTextureBuffers[1].createView() },
            { binding: 2, resource: pressureTextureBuffers[0].createView() },
        ],
    }),
];

// Projection: reads velocity[1] + pressure, writes velocity[0]
const projectionBindGroup = device.createBindGroup({
    label: "Projection Bind Group",
    layout: projectionBindGroupLayout,
    entries: [
        { binding: 0, resource: velocityTextureBuffers[1].createView() },
        { binding: 1, resource: pressureTextureBuffers[0].createView() },
        { binding: 2, resource: velocityTextureBuffers[0].createView() },
    ],
});

// Render: reads velocity[1] (advection output, until projection is added)
const renderBindGroup = device.createBindGroup({
    label: "Render Bind Group",
    layout: renderBindGroupLayout,
    entries: [
        { binding: 0, resource: velocityTextureBuffers[0].createView() },
        { binding: 1, resource: sampler },
    ],
});

const renderPassDescriptor = {
    label: "Render Pass Description",
    colorAttachments: [
        {
            clearValue: [0.8, 0.8, 0.0, 1.0],
            loadOp: "clear",
            storeOp: "store",
            view: context.getCurrentTexture().createView(),
        },
    ],
};
// END PIPELINES SETUP

// debug first state
device.queue.writeTexture(
    { texture: velocityTextureBuffers[0] },
    startTextureData,
    //      rgba * float16 * ...
    { bytesPerRow: 4 * 2 * SIM_SIZE },
    { width: SIM_SIZE, height: SIM_SIZE },
);

// RENDER
const render = (deltaTime: number, elapsedTime: number) => {
    renderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();

    const encoder = device.createCommandEncoder({ label: "command encoder" });

    // UNIFORMS
    device.queue.writeBuffer(
        uniformBuffer,
        0,
        new Float32Array([
            deltaTime / 1000,
            1.0 / SIM_SIZE,
            mousePos.x,
            mousePos.y,
            mouseDelta.x * (mouseDown ? 1.0 : 0.0),
            mouseDelta.y * (mouseDown ? 1.0 : 0.0),
        ]),
    );

    // COMPUTE PASSES
    const workgroupCount = Math.ceil(SIM_SIZE / WORKGROUP_SIZE);

    // ADVECTION: velocity[0] -> velocity[1]
    const advectionPass = encoder.beginComputePass();
    advectionPass.setPipeline(advectionComputePipeline);
    advectionPass.setBindGroup(0, advectionBindGroup);
    advectionPass.dispatchWorkgroups(workgroupCount, workgroupCount);
    advectionPass.end();

    // DIVERGENCE: velocity[1] -> divergence[0]
    const divergencePass = encoder.beginComputePass();
    divergencePass.setPipeline(divergenceComputePipeline);
    divergencePass.setBindGroup(0, divergenceBindGroup);
    divergencePass.dispatchWorkgroups(workgroupCount, workgroupCount);
    divergencePass.end();

    // PRESSURE SOLVE: divergence[0] + pressure ping-pong
    for (let i = 0; i < 60; i++) {
        const pressurePass = encoder.beginComputePass();
        pressurePass.setPipeline(pressureComputePipeline);
        pressurePass.setBindGroup(0, pressureBindGroups[i % 2]);
        pressurePass.dispatchWorkgroups(workgroupCount, workgroupCount);
        pressurePass.end();
    }

    // PROJECTION STEP
    const projectionPass = encoder.beginComputePass();
    projectionPass.setPipeline(projectionComputePipeline);
    projectionPass.setBindGroup(0, projectionBindGroup);
    projectionPass.dispatchWorkgroups(workgroupCount, workgroupCount);
    projectionPass.end();

    // TEMP: visualize advection
    // encoder.copyTextureToTexture(
    //     { texture: velocityTextureBuffers[1] },
    //     { texture: velocityTextureBuffers[0] },
    //     [SIM_SIZE, SIM_SIZE],
    // );

    // RENDER PASS
    // @ts-ignore
    const renderPass = encoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderBindGroup);
    renderPass.draw(3);
    renderPass.end();

    device.queue.submit([encoder.finish()]);
};

const renderLoop = (timestamp: number) => {
    if (startTime === undefined) {
        startTime = timestamp;
        lastFrameTime = timestamp;
    }
    const elapsedTime = timestamp - startTime;
    const deltaTime = timestamp - lastFrameTime;

    render(deltaTime, elapsedTime);

    lastFrameTime = timestamp;
    requestAnimationFrame(renderLoop);
};

requestAnimationFrame(renderLoop);
// END RENDER
