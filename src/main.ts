import './style.css'
import {UPDATE_INTERVAL} from "./constants.ts";

// getting the html canvas
const canvas: HTMLCanvasElement = document.getElementById("GLCanvas")! as HTMLCanvasElement

// MAIN SETUP FOR RENDERING
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();

if (!device) {
    throw Error("No gpu detected")
}

const context = canvas.getContext("webgpu")
if (!context){
    throw Error("Error getting the context");
}

const devicePixelRatio = window.devicePixelRatio
canvas.width = canvas.clientWidth * devicePixelRatio
canvas.height = canvas.clientHeight * devicePixelRatio

const presentationFormat = navigator.gpu.getPreferredCanvasFormat()
context.configure({
    device: device,
    format: presentationFormat,
})

// END MAIN SETUP FOR RENDERING

// LOAD SHADERS
const loadWGSL = async (path: string)=> {
    const response = await fetch(path)
    if (!response.ok) {
        throw new Error(`Failed to load shader: ${path}`)
    }
    return response.text()
}

const loadShaderModule = async (path: string): Promise<GPUShaderModule> => {
    const code = await loadWGSL(path)
    return device.createShaderModule({ code })
};

const vertexShader = await loadShaderModule('shaders/vertex.wgsl')
const fragmentShader = await loadShaderModule('shaders/fragment.wgsl')
const computeShader = await loadShaderModule('shaders/compute.wgsl')
// END LOAD SHADERS

// PIPELINES SETUP

const pipelineLayout = device.createPipelineLayout({
    label: "Pipeline Layout",
    bindGroupLayouts: []
})

const renderPipeline = device.createRenderPipeline({
    label: "Render Pipeline",
    layout: pipelineLayout,
    vertex: {
        module: vertexShader,
        buffers: []
    },
    fragment: {
        module: fragmentShader,
        targets: [{format: presentationFormat}]
    },
})

// const computePipeline = device.createComputePipeline({
//     label: "Compute Pipeline",
//     layout: pipelineLayout,
//     compute: {
//         module: computeShader,
//         entryPoint: "computeMain"
//     },
// })

const renderPassDescriptor = {
    label: "Render Pass Description",
    colorAttachments: [{
        clearValue: [0.8, 0.8, 0.0, 1.0],
        loadOp: "clear",
        storeOp: "store",
        view: context.getCurrentTexture().createView()
    }]
}

// END PIPELINES SETUP

// RENDER 

const render = () => {
    (renderPassDescriptor.colorAttachments as any)[0].view = context.getCurrentTexture().createView()

    const encoder = device.createCommandEncoder({label: "command encoder"})

    // COMPUTE PASS
    // const computePass = encoder.beginComputePass()
    // computePass.setPipeline(computePipeline)
    // computePass.setBindGroup(0, bindGroups![step % 2])
    //
    // const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    // computePass.dispatchWorkgroups(workgroupCount, workgroupCount)
    //
    // computePass.end()
    //
    // step++;

    // RENDER PASS
    // @ts-ignore
    const renderPass = encoder.beginRenderPass(renderPassDescriptor);
    renderPass.setPipeline(renderPipeline)

    renderPass.draw(3)
    renderPass.end()

    device.queue.submit([encoder.finish()])
}

const renderLoop = () => {
    setInterval(() => render(), UPDATE_INTERVAL)
}

renderLoop()

// END RENDER 
