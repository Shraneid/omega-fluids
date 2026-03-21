import "./style.css";
import { SIM_SIZE, WORKGROUP_SIZE } from "./constants.ts";

let current_ping_pong_buffer_index = 1;

let startTime: number;
let lastFrameTime: number;

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
    const halfW = SIM_SIZE / 2 - SIM_SIZE / 3; // matches your xSize inset
    const halfH = SIM_SIZE / 2 - (SIM_SIZE / 10) * 4; // matches your ySize*4 inset
    const d = rectSDF(x, y, halfW, halfH);
    // d < 0 → fully inside, d > FADE_WIDTH → fully outside
    const intensity = 1 - smoothstep(-FADE_WIDTH, 0, d);
    return { x: 0.0, y: intensity };
};

const startTextureData = new Float16Array(SIM_SIZE * SIM_SIZE * 4); // 4 channels (rgba)
for (let y = 0; y < SIM_SIZE; y++) {
    for (let x = 0; x < SIM_SIZE; x++) {
        const i = (y * SIM_SIZE + x) * 4;
        const val = getInitialVelocity(x, y);
        startTextureData[i + 0] = val.x; // r // right
        startTextureData[i + 1] = val.y; // g // up
        startTextureData[i + 2] = 0.0; // b // unused
        startTextureData[i + 3] = 1.0; // a // unused
    }
}

// getting the HTML canvas
const canvas: HTMLCanvasElement = document.getElementById(
    "GLCanvas",
)! as HTMLCanvasElement;

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
const computeShader = await loadShaderModule("shaders/compute.wgsl");
// END LOAD SHADERS

// BUFFERS
const uniformBuffer = device.createBuffer({
    label: "Uniform Buffer",
    size: 16,
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
const computeBindGroupLayout = device.createBindGroupLayout({
    label: "Compute Bind Group Layout",
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
        {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: { format: "rgba16float", access: "write-only" },
        },
        {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            texture: { sampleType: "float" },
        },
        {
            binding: 4,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: { format: "rgba16float", access: "write-only" },
        },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, sampler: {} },
        {
            binding: 6,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: "uniform" },
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
const computePipelineLayout = device.createPipelineLayout({
    label: "Compute Pipeline Layout",
    bindGroupLayouts: [computeBindGroupLayout],
});
const renderPipelineLayout = device.createPipelineLayout({
    label: "Render Pipeline Layout",
    bindGroupLayouts: [renderBindGroupLayout],
});

const advectionComputePipeline = device.createComputePipeline({
    label: "Advection Compute Pipeline",
    layout: computePipelineLayout,
    compute: { module: computeShader, entryPoint: "advectionStep" },
});
// const diffuseComputePipeline = device.createComputePipeline({
//     label: "Diffuse Compute Pipeline",
//     layout: computePipelineLayout,
//     compute: { module: computeShader, entryPoint: "diffuseStep" },
// });
const divergenceComputePipeline = device.createComputePipeline({
    label: "Dissipate Compute Pipeline",
    layout: computePipelineLayout,
    compute: { module: computeShader, entryPoint: "divergenceStep" },
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

const computeBindGroups = [
    device.createBindGroup({
        label: "Compute Bind Group A",
        layout: computeBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: velocityTextureBuffers[0].createView(),
            },
            {
                binding: 1,
                resource: velocityTextureBuffers[1].createView(),
            },
            {
                binding: 2,
                resource: divergenceTextureBuffers[0].createView(),
            },
            {
                binding: 3,
                resource: pressureTextureBuffers[0].createView(),
            },
            {
                binding: 4,
                resource: pressureTextureBuffers[1].createView(),
            },
            {
                binding: 5,
                resource: sampler,
            },
            {
                binding: 6,
                resource: { buffer: uniformBuffer },
            },
        ],
    }),
    device.createBindGroup({
        label: "Compute Bind Group B",
        layout: computeBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: velocityTextureBuffers[1].createView(),
            },
            {
                binding: 1,
                resource: velocityTextureBuffers[0].createView(),
            },
            {
                binding: 2,
                resource: divergenceTextureBuffers[1].createView(),
            },
            {
                binding: 3,
                resource: pressureTextureBuffers[1].createView(),
            },
            {
                binding: 4,
                resource: pressureTextureBuffers[0].createView(),
            },
            {
                binding: 5,
                resource: sampler,
            },
            {
                binding: 6,
                resource: { buffer: uniformBuffer },
            },
        ],
    }),
];

const renderBindGroups = [
    device.createBindGroup({
        label: "Render Bind Group A",
        layout: renderBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: velocityTextureBuffers[1].createView(),
            },
            {
                binding: 1,
                resource: sampler,
            },
        ],
    }),
    device.createBindGroup({
        label: "Render Bind Group B",
        layout: renderBindGroupLayout,
        entries: [
            {
                binding: 0,
                resource: velocityTextureBuffers[0].createView(),
            },
            {
                binding: 1,
                resource: sampler,
            },
        ],
    }),
];

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
    current_ping_pong_buffer_index = current_ping_pong_buffer_index ? 0 : 1;

    renderPassDescriptor.colorAttachments[0].view = context
        .getCurrentTexture()
        .createView();

    const encoder = device.createCommandEncoder({ label: "command encoder" });

    // UNIFORMS
    device.queue.writeBuffer(
        uniformBuffer,
        0,
        new Float32Array([deltaTime / 1000, 1.0 / SIM_SIZE]),
    );

    // COMPUTE PASS
    const workgroupCount = Math.ceil(SIM_SIZE / WORKGROUP_SIZE);

    // ADVECTION STEP
    const advectionComputePass = encoder.beginComputePass();

    advectionComputePass.setPipeline(advectionComputePipeline);
    advectionComputePass.setBindGroup(
        0,
        computeBindGroups[current_ping_pong_buffer_index],
    );
    advectionComputePass.dispatchWorkgroups(workgroupCount, workgroupCount);

    advectionComputePass.end();

    // DIFFUSE STEP
    // const diffuseComputePass = encoder.beginComputePass();
    //
    // diffuseComputePass.setPipeline(diffuseComputePipeline);
    // diffuseComputePass.setBindGroup(
    //     0,
    //     computeBindGroups[current_ping_pong_buffer_index],
    // );
    // diffuseComputePass.dispatchWorkgroups(workgroupCount, workgroupCount);
    //
    // diffuseComputePass.end();

    // DISSIPATE STEP
    const divergenceComputePass = encoder.beginComputePass();

    divergenceComputePass.setPipeline(divergenceComputePipeline);
    divergenceComputePass.setBindGroup(
        0,
        computeBindGroups[current_ping_pong_buffer_index],
    );
    divergenceComputePass.dispatchWorkgroups(workgroupCount, workgroupCount);

    divergenceComputePass.end();

    // RENDER PASS
    // @ts-ignore
    const renderPass = encoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(renderPipeline);

    renderPass.setBindGroup(
        0,
        renderBindGroups[current_ping_pong_buffer_index],
    );

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
