(() => {
  const defaults = { enabled: true, preset: "zebra", color: "#00afa5", size: "medium" };
  const normalize = value => ({
    enabled: value?.enabled !== false,
    preset: ["simple", "zebra", "grid"].includes(value?.preset) ? value.preset : defaults.preset,
    color: /^#[\da-f]{6}$/i.test(value?.color || "") ? value.color.toLowerCase() : defaults.color,
    size: ["small", "medium", "large"].includes(value?.size) ? value.size : defaults.size,
  });
  function palette(value) {
    const config = normalize(value);
    const rgb = config.color.match(/[\da-f]{2}/gi).map(part => parseInt(part, 16));
    const mix = weight => "#" + rgb.map(channel => Math.round(255 * (1 - weight) + channel * weight).toString(16).padStart(2, "0")).join("");
    return { header: mix(.16), stripe: mix(.055), border: mix(.25), text: "#1d293d", font: { small: 12, medium: 14, large: 16 }[config.size] };
  }
  globalThis.JsyTableStyle = Object.freeze({ defaults, normalize, palette });
})();
