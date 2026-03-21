const SIM_SIZE = 128;

struct SimParams {
    dt: f32,
    dx: f32,
}

@group(0) @binding(0) var texture_velocity_previous: texture_2d<f32>;
@group(0) @binding(1) var texture_velocity_update: texture_storage_2d<rgba16float, write>;

@group(0) @binding(2) var texture_divergence: texture_storage_2d<rgba16float, write>;

@group(0) @binding(3) var texture_pressure_previous: texture_2d<f32>;
@group(0) @binding(4) var texture_pressure_update: texture_storage_2d<rgba16float, write>;

@group(0) @binding(5) var sampler_texture: sampler;
@group(0) @binding(6) var<uniform> params: SimParams;


fn isBoundary(pos: vec2u) -> bool {
    if (pos.x == 0 || pos.x == SIM_SIZE){
        return true;
    } else if (pos.y == 0 || pos.y == SIM_SIZE) {
        return true;
    } else {
        return false;
    }
}

@compute
@workgroup_size(8, 8)
fn advectionStep(@builtin(global_invocation_id) pos: vec3u) {
    let texel = pos.xy;
    let position = (vec2f(texel) + 0.5) / vec2f(textureDimensions(texture_velocity_previous));

    let currentVelocity = textureSampleLevel(texture_velocity_previous, sampler_texture, position, 0).xy;
    let previousStepVelocity = textureSampleLevel(texture_velocity_previous, sampler_texture, position - currentVelocity * params.dt, 0).xy;
    textureStore(texture_velocity_update, texel, vec4f(previousStepVelocity, 0.0, 1.0));
}

@compute
@workgroup_size(8, 8)
fn divergenceStep(@builtin(global_invocation_id) pos: vec3u) {
    let texel = pos.xy;
    let position = (vec2f(texel) + 0.5) / vec2f(textureDimensions(texture_velocity_previous));

    if (isBoundary(texel)){
        return;
    }

    let up = vec2i(texel) + vec2i(0, 1);
    let down = vec2i(texel) + vec2i(0, -1);
    let right = vec2i(texel) + vec2i(1, 0);
    let left = vec2i(texel) + vec2i(-1, 0);

    let dPdx = right.x - left.x;
    let dQdy = up.y - down.y;

    let divergence = f32(dPdx + dQdy) * 0.5;

    textureStore(texture_divergence, texel, vec4f(divergence, 0, 0, 0));
}