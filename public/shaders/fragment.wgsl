struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
};

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
    return vec4f(in.uv, 0.0, 1.0);
}
