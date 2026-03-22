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

@group(0) @binding(0) var texture_divergence: texture_2d<f32>;
@group(0) @binding(1) var texture_pressure_previous: texture_2d<f32>;
@group(0) @binding(2) var texture_pressure_update: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn pressureStep(@builtin(global_invocation_id) pos: vec3u) {
    let texel = pos.xy;

    if (isBoundary(texel)) {
        var edgePressure = 0.0;
        if (texel.x == 0) {
            edgePressure = textureLoad(texture_pressure_previous, vec2i(texel) + vec2i( 1, 0), 0).r;
        } else if (texel.x == SIM_SIZE - 1) {
            edgePressure = textureLoad(texture_pressure_previous, vec2i(texel) + vec2i( -1, 0), 0).r;
        } else if (texel.y == 0) {
            edgePressure = textureLoad(texture_pressure_previous, vec2i(texel) + vec2i( 0, 1), 0).r;
        } else if (texel.y == SIM_SIZE - 1) {
            edgePressure = textureLoad(texture_pressure_previous, vec2i(texel) + vec2i( 0, -1), 0).r;
        }
        textureStore(texture_pressure_update, texel, vec4f(edgePressure, 0.0, 0.0, 0.0));
        return;
    }

    let divergence = textureLoad(texture_divergence, vec2i(texel), 0).r;

    let left = textureLoad(texture_pressure_previous, vec2i(texel) + vec2i(-1, 0), 0).r;
    let right = textureLoad(texture_pressure_previous, vec2i(texel) + vec2i( 1, 0), 0).r;
    let up = textureLoad(texture_pressure_previous, vec2i(texel) + vec2i( 0, 1), 0).r;
    let down = textureLoad(texture_pressure_previous, vec2i(texel) + vec2i( 0,-1), 0).r;

    let p = (left + right + up + down - divergence) / 4.0;

    textureStore(texture_pressure_update, texel, vec4f(p, 0.0, 0.0, 0.0));
}
