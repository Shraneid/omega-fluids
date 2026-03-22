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
@group(0) @binding(1) var texture_pressure: texture_2d<f32>;
@group(0) @binding(2) var texture_velocity_updated: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn projectionStep(@builtin(global_invocation_id) pos: vec3u) {
    let texel = pos.xy;

    if (isBoundary(texel)) {
        var reflectedVelocity = vec2f(0);
        var normalReflect = vec2f(1, 1);
        if (texel.x == 0){
            reflectedVelocity = textureLoad(texture_velocity_previous, vec2i(texel) + vec2i( 1, 0), 0).xy;
            reflectedVelocity.x *= -1;
        }
        else if (texel.x == SIM_SIZE - 1){
            reflectedVelocity = textureLoad(texture_velocity_previous, vec2i(texel) + vec2i( -1, 0), 0).xy;
            reflectedVelocity.x *= -1;
        }
        else if (texel.y == 0){
            reflectedVelocity = textureLoad(texture_velocity_previous, vec2i(texel) + vec2i( 0, 1), 0).xy;
            reflectedVelocity.y *= -1;
        }
        else if (texel.y == SIM_SIZE - 1){
            reflectedVelocity = textureLoad(texture_velocity_previous, vec2i(texel) + vec2i( 0, -1), 0).xy;
            reflectedVelocity.y *= -1;
        }

        textureStore(texture_velocity_updated, texel, vec4f(reflectedVelocity, 0.0, 1.0));
        return;
    }

    let old_velocity = textureLoad(texture_velocity_previous, texel, 0).xy;

    let left = textureLoad(texture_pressure, vec2i(texel) + vec2i(-1, 0), 0).r;
    let right = textureLoad(texture_pressure, vec2i(texel) + vec2i( 1, 0), 0).r;
    let up = textureLoad(texture_pressure, vec2i(texel) + vec2i( 0, 1), 0).r;
    let down = textureLoad(texture_pressure, vec2i(texel) + vec2i( 0,-1), 0).r;

    var grad_pressure = vec2f();
    grad_pressure.x = (right - left) * 0.5;
    grad_pressure.y = (up - down) * 0.5;

    let new_velocity = old_velocity - grad_pressure;

    textureStore(texture_velocity_updated, texel, vec4f(new_velocity, 0.0, 1.0));
}
