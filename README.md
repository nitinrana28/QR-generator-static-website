# QR Code Generator

A clean, responsive QR code generator built with plain HTML, CSS, and JavaScript.

## Features

- Enter any valid URL
- Generate a scannable QR code on the page
- Download the QR code as a PNG
- Responsive layout for desktop and mobile screens
- Works without a backend or build step
- Uses a local QR generator, so no CDN connection is required

## Getting Started

Open `index.html` in your browser:

```text
index.html
```

No installation is required.

## Project Structure

```text
.
|-- index.html   # App markup
|-- styles.css   # Responsive styling
|-- script.js    # Form handling, validation, and PNG download
`-- qr-lite.js   # Local QR code rendering logic
```

## Usage

1. Enter a URL in the input field.
2. Click **Generate**.
3. Preview the QR code on the page.
4. Click **Download PNG** to save it.

If the URL does not include `http://` or `https://`, the app automatically adds `https://`.

## Tech Stack

- HTML5
- CSS3
- JavaScript
- Canvas API
