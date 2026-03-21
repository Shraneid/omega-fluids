export const lerp = (a: number, b: number, t: number) => {
    return a + (b - a) * t;
};

export const map = (
    value: number,
    oldMin: number,
    oldMax: number,
    currentMin: number = 0,
    currentMax: number = 1,
) => {
    const percent = (value - oldMin) / (oldMax - oldMin);
    console.log(percent);
    return percent * (currentMax - currentMin) + currentMin;
};
