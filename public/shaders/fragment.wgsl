@group(0) @binding(0) var texture_velocity: texture_2d<f32>;
@group(0) @binding(1) var sampler_texture: sampler;

struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
};

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    let vel = textureSample(texture_velocity, sampler_texture, in.uv);

    return vec4f(vel.xyz, 1.0);
//    return vec4f(in.uv, 0.0, 1.0);
}
