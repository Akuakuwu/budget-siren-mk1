"use strict";

const W = 256;
const H = 192;
const byId = (id) => document.getElementById(id);
const plotHost = byId("signalCanvas");
const imageHost = byId("imageCanvas");
const plotColors = { y: "#d7fa63", r: "#ff7683", g: "#8fedac", b: "#83a7ff" };
const state = { image: null, row: 0, rate: 16, playing: false, mode: "bars", channel: "y" };
const file = byId("file");
let imageRequest = 0;
let progress = 0;
let plot;

function setRunning(playing) {
  state.playing = playing;
  byId("play").textContent = playing ? "Pause" : "Start";
}

function setRow(row) {
  state.row = row;
  byId("line").textContent = `Row ${row + 1} of ${H}`;
  byId("seek").value = String(row);
  byId("percent").value = `${Math.round(row * 100 / (H - 1))}%`;
  plot?.redraw();
}

function setImage(image, name) {
  state.image = image;
  byId("play").disabled = false;
  setRunning(false);
  progress = 0;
  setRow(0);
  byId("status").textContent = `${name} · ${W} × ${H} pixels`;
}

function fitUpload(p, image) {
  const result = p.createGraphics(W, H);
  result.pixelDensity(1);
  result.background(0);
  const scale = Math.min(W / image.width, H / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  result.image(image, (W - width) / 2, (H - height) / 2, width, height);
  const pixels = result.get();
  pixels.loadPixels();
  result.remove();
  return pixels;
}

new p5((p) => {
  function fitCanvas() {
    p.resizeCanvas(imageHost.clientWidth, imageHost.clientHeight);
  }

  p.setup = () => {
    p.pixelDensity(1);
    p.createCanvas(imageHost.clientWidth, imageHost.clientHeight).parent(imageHost);
    p.frameRate(30);
    new ResizeObserver(fitCanvas).observe(imageHost);

    file.addEventListener("change", () => {
      const selected = file.files[0];
      if (!selected) return;
      file.value = "";
      const request = ++imageRequest;
      const url = URL.createObjectURL(selected);
      byId("status").textContent = "Opening image…";
      p.loadImage(url, (image) => {
        URL.revokeObjectURL(url);
        if (request === imageRequest) setImage(fitUpload(p, image), selected.name);
      }, () => {
        URL.revokeObjectURL(url);
        if (request === imageRequest) byId("status").textContent = "Could not open this image. Try a PNG, JPEG, or WebP file.";
      });
    });
  };

  p.draw = () => {
    if (state.playing) {
      progress += state.rate * Math.min(p.deltaTime, 100) / 1000;
      const steps = Math.floor(progress);
      if (steps) {
        progress -= steps;
        setRow(Math.min(state.row + steps, H - 1));
        if (state.row === H - 1) setRunning(false);
      }
    }
    p.background("#101216");
    if (!state.image) return;
    const scale = Math.min(p.width / W, p.height / H);
    const width = W * scale;
    const height = H * scale;
    const left = (p.width - width) / 2;
    const top = (p.height - height) / 2;
    p.noSmooth();
    p.image(state.image, left, top, width, height);
    const scanY = top + (state.row + 0.5) * scale;
    p.noStroke();
    p.fill(8, 10, 15, 77);
    p.rect(left, scanY, width, top + height - scanY);
    p.fill(215, 250, 99, 32);
    p.rect(left, scanY - 3, width, 6);
    p.stroke("#d7fa63");
    p.line(left, scanY, left + width, scanY);
  };
}, imageHost);

function valueAt(x, channel) {
  const index = (state.row * W + x) * 4;
  const pixels = state.image.pixels;
  if (channel === "y") return pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
  return pixels[index + "rgb".indexOf(channel)];
}

plot = new p5((p) => {
  p.setup = () => {
    p.pixelDensity(1);
    p.createCanvas(plotHost.clientWidth, plotHost.clientHeight).parent(plotHost);
    p.noLoop();
    new ResizeObserver(() => {
      p.resizeCanvas(plotHost.clientWidth, plotHost.clientHeight);
      p.redraw();
    }).observe(plotHost);
  };

  p.draw = () => {
    p.background("#121417");
    if (!state.image) return;
    const channels = state.channel === "rgb" ? ["r", "g", "b"] : [state.channel];
    const unit = p.width / W;
    const height = p.height - 2;
    if (state.mode !== "strip") {
      p.stroke("#292d33");
      for (let i = 0; i <= 4; i++) p.line(0, 1 + height * i / 4, p.width, 1 + height * i / 4);
      for (let i = 1; i < 8; i++) p.line(p.width * i / 8, 0, p.width * i / 8, p.height);
    }
    channels.forEach((channel, band) => {
      const color = p.color(plotColors[channel]);
      const lane = p.height / channels.length;
      if (state.mode === "wave") {
        p.noFill();
        p.stroke(color);
        p.strokeWeight(1.5);
        p.beginShape();
        for (let x = 0; x < W; x++) {
          p.vertex((x + 0.5) * unit, 1 + height * (1 - valueAt(x, channel) / 255));
        }
        p.endShape();
        p.strokeWeight(1);
        return;
      }
      p.noStroke();
      const columns = state.mode === "bars" ? 64 : W;
      for (let i = 0; i < columns; i++) {
        const count = W / columns;
        const x = i * count;
        let value = 0;
        for (let pixel = x; pixel < x + count; pixel++) value += valueAt(pixel, channel) / count;
        if (state.mode === "strip") {
          p.fill(p.lerpColor(p.color("#101216"), color, value / 255));
          p.rect(Math.floor(x * unit), band * lane, Math.ceil((x + 1) * unit) - Math.floor(x * unit), lane);
        } else {
          const barWidth = unit * count / channels.length;
          const barHeight = height * value / 255;
          p.fill(color);
          p.rect(x * unit + band * barWidth, height + 1 - barHeight, Math.max(barWidth - (channels.length === 1 ? 1 : 0), 0.5), barHeight);
        }
      }
    });
  };
}, plotHost);

byId("play").addEventListener("click", () => {
  if (!state.image) return;
  if (!state.playing && state.row === H - 1) {
    setRow(0);
    progress = 0;
  }
  setRunning(!state.playing);
});
byId("reset").addEventListener("click", () => {
  setRunning(false);
  progress = 0;
  setRow(0);
});
byId("seek").addEventListener("input", (event) => {
  setRunning(false);
  progress = 0;
  setRow(Number(event.target.value));
});
byId("rate").addEventListener("input", (event) => {
  state.rate = Number(event.target.value);
  byId("rateValue").value = `${state.rate} rows/s`;
});
byId("mode").addEventListener("change", (event) => {
  state.mode = event.target.value;
  document.querySelector(".axis").hidden = state.mode === "strip";
  plot.redraw();
});
byId("channel").addEventListener("change", (event) => {
  state.channel = event.target.value;
  plot.redraw();
});
