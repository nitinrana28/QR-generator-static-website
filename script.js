const form = document.querySelector("#qr-form");
const input = document.querySelector("#url-input");
const message = document.querySelector("#message");
const canvas = document.querySelector("#qr-canvas");
const emptyState = document.querySelector("#empty-state");
const downloadButton = document.querySelector("#download-button");

let currentUrl = "";

const normalizeUrl = (value) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const setMessage = (text, type = "error") => {
  message.textContent = text;
  message.classList.toggle("success", type === "success");
};

const isValidUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const url = normalizeUrl(input.value);

  if (!isValidUrl(url)) {
    setMessage("Enter a valid web address.");
    input.focus();
    return;
  }

  if (!window.drawQrToCanvas) {
    setMessage("QR generator could not be loaded. Refresh the page and try again.");
    return;
  }

  try {
    window.drawQrToCanvas(canvas, url, {
      width: 280,
      dark: "#142033",
      light: "#ffffff",
    });

    currentUrl = url;
    input.value = url;
    canvas.classList.add("visible");
    emptyState.classList.add("hidden");
    downloadButton.disabled = false;
    setMessage("QR code ready.", "success");
  } catch (error) {
    setMessage(error.message || "Something went wrong while generating the QR code.");
  }
});

downloadButton.addEventListener("click", () => {
  if (!currentUrl) {
    return;
  }

  const link = document.createElement("a");
  const safeName = new URL(currentUrl).hostname.replace(/^www\./, "") || "qr-code";

  link.href = canvas.toDataURL("image/png");
  link.download = `${safeName}-qr-code.png`;
  link.click();
});
