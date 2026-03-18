struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOut {
    var out: VertexOut;

    // Fullscreen triangle trick: 3 vertices, no vertex buffer needed.
    // vertex 0 → (-1, -1), vertex 1 → (3, -1), vertex 2 → (-1, 3)
    let x = f32(i32(vi & 1u) * 4 - 1);
    let y = f32(i32(vi & 2u) * 2 - 1);

    out.pos = vec4f(x, y, 0.0, 1.0);
    out.uv  = vec2f(x * 0.5 + 0.5, y * 0.5 + 0.5);

    return out;
}
