struct SimParams {
    dt: f32,
    dx: f32,
}

@group(0) @binding(0) var texture_velocity_previous: texture_2d<f32>;
@group(0) @binding(1) var texture_velocity_update: texture_storage_2d<rgba16float, write>;

@group(0) @binding(2) var texture_pressure_previous: texture_2d<f32>;
@group(0) @binding(3) var texture_pressure_update: texture_storage_2d<rgba16float, write>;

@group(0) @binding(4) var sampler_texture: sampler;
@group(0) @binding(5) var<uniform> dt: SimParams;



@compute
@workgroup_size(8, 8)
fn computeMain(@builtin(global_invocation_id) pos: vec3u) {
    let texel = pos.xy;
    let position = (vec2f(texel) + 0.5) / vec2f(textureDimensions(texture_velocity_previous));

    let currentColor = textureSampleLevel(texture_velocity_previous, sampler_texture, position, 0);
    textureStore(texture_velocity_update, texel, currentColor + vec4(.005f, 0.0f, 0.0f, 0.0f));
}