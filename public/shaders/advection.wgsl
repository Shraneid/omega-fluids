const SIM_SIZE = 1024;
const MOUSE_FORCE_MULTIPLIER = 5.0;

struct SimParams {
    color: vec4f,
    mousePos: vec2f,
    mouseDelta: vec2f,
    dt: f32,
    elapsedTime: f32,
}

@group(0) @binding(0) var texture_velocity_previous: texture_2d<f32>;
@group(0) @binding(1) var texture_velocity_update: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var sampler_texture: sampler;
@group(0) @binding(3) var<uniform> params: SimParams;
@group(0) @binding(4) var texture_dye_previous: texture_2d<f32>;
@group(0) @binding(5) var texture_dye_update: texture_storage_2d<rgba16float, write>;


fn getAdditionalForce(currentPosition: vec2f) -> vec2f {
    let mousePosition = params.mousePos;
    let forceDirection = params.mouseDelta;

    let currentPositionUV = currentPosition / vec2f(SIM_SIZE);

    let distance = length(mousePosition - currentPositionUV);
    let force = smoothstep(0.1, 0.0, distance);

    return forceDirection * force * MOUSE_FORCE_MULTIPLIER;
}

fn getDyeSplat(texel: vec2u, position: vec2f) -> vec4f {
    let currentPosition = vec2f(texel);

    let mousePosition = params.mousePos;
    let forceDirection = params.mouseDelta;

    let currentPositionUV = currentPosition / vec2f(SIM_SIZE);

    let distance = length(mousePosition - currentPositionUV);
    var multiplier = smoothstep(0.1, 0.0, distance);

    if (params.elapsedTime < 1000) {
        multiplier = clamp(length(textureSampleLevel(texture_velocity_previous, sampler_texture, position, 0).xy), 0, 1);
    }

    return params.color * multiplier;
}

@compute @workgroup_size(8, 8)
fn advectionStep(@builtin(global_invocation_id) pos: vec3u) {
    let texel = pos.xy;
    let position = (vec2f(texel) + 0.5) / vec2f(textureDimensions(texture_velocity_previous));

    var additionalForce = vec2f(0);
    var dyeSplat = vec4f(0);
    if (params.mousePos.x >= 0){
        additionalForce = getAdditionalForce(vec2f(texel));
        dyeSplat = getDyeSplat(texel, position);
    }
    if (params.elapsedTime < 1000){
        dyeSplat = getDyeSplat(texel, position);
    }

    let currentVelocity = textureSampleLevel(texture_velocity_previous, sampler_texture, position, 0).xy;
    let samplePosition = position - currentVelocity * params.dt;
    let previousStepVelocity = textureSampleLevel(texture_velocity_previous, sampler_texture, samplePosition, 0).xy;
    textureStore(texture_velocity_update, texel, vec4f(previousStepVelocity + additionalForce, 0.0, 1.0));

    let previousStepDye = textureSampleLevel(texture_dye_previous, sampler_texture, samplePosition, 0);
    textureStore(texture_dye_update, texel, vec4f(previousStepDye.rgb * 0.99 + dyeSplat.rgb, 1.0));
}
