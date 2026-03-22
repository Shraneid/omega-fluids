const SIM_SIZE = 1024;
const MOUSE_FORCE_MULTIPLIER = 5.0;

struct SimParams {
    dt: f32,
    dx: f32,
    mousePos: vec2f,
    mouseDelta: vec2f,
}

@group(0) @binding(0) var texture_velocity_previous: texture_2d<f32>;
@group(0) @binding(1) var texture_velocity_update: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var sampler_texture: sampler;
@group(0) @binding(3) var<uniform> params: SimParams;


fn getAdditionalForce(currentPosition: vec2f) -> vec2f {
    let mousePosition = params.mousePos;
    let forceDirection = params.mouseDelta;

    let currentPositionUV = currentPosition / vec2f(SIM_SIZE);

    let distance = length(mousePosition - currentPositionUV);

    let force = smoothstep(0.1, 0.0, distance);

    return forceDirection * force * MOUSE_FORCE_MULTIPLIER;
}

@compute @workgroup_size(8, 8)
fn advectionStep(@builtin(global_invocation_id) pos: vec3u) {
    let texel = pos.xy;
    let position = (vec2f(texel) + 0.5) / vec2f(textureDimensions(texture_velocity_previous));

    let additionalForce = getAdditionalForce(vec2f(texel));

    let currentVelocity = textureSampleLevel(texture_velocity_previous, sampler_texture, position, 0).xy;
    let previousStepVelocity = textureSampleLevel(texture_velocity_previous, sampler_texture, position - currentVelocity * params.dt, 0).xy;
    textureStore(texture_velocity_update, texel, vec4f(previousStepVelocity + additionalForce, 0.0, 1.0));
}
