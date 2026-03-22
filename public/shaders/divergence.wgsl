const SIM_SIZE = 1024;

fn isBoundary(pos: vec2u) -> bool {
    if (pos.x == 0 || pos.x == SIM_SIZE - 1) {
        return true;
    } else if (pos.y == 0 || pos.y == SIM_SIZE - 1) {
        return true;
    } else {
        return false;
    }
}

@group(0) @binding(0) var texture_velocity_previous: texture_2d<f32>;
@group(0) @binding(1) var texture_divergence: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn divergenceStep(@builtin(global_invocation_id) pos: vec3u) {
    let texel = pos.xy;

    if (isBoundary(texel)) {
        return;
    }

    let right = vec2i(texel) + vec2i(1, 0);
    let left = vec2i(texel) + vec2i(-1, 0);
    let up = vec2i(texel) + vec2i(0, 1);
    let down = vec2i(texel) + vec2i(0, -1);

    let dPdx = textureLoad(texture_velocity_previous, right, 0).x - textureLoad(texture_velocity_previous, left, 0).x;
    let dQdy = textureLoad(texture_velocity_previous, up, 0).y - textureLoad(texture_velocity_previous, down, 0).y;

    let divergence = (dPdx + dQdy) * 0.5;

    textureStore(texture_divergence, texel, vec4f(divergence, 0.0, 0.0, 0.0));
}
