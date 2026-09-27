# 🎨 DrawAPoint

A minimalist, fast, and responsive infinite canvas drawing application for the browser. Built with pure HTML5, CSS3, and JavaScript — zero external dependencies, no build steps required, and ready to deploy on **GitHub Pages**.

---

## ✨ Features

- **Infinite Canvas**:
  - Smooth pan in any direction.
  - Logarithmic zoom from 5% to 200% centered on cursor or touch midpoint.
  - Touch support: pinch-to-zoom and two-finger panning.
- **Drawing Tools**:
  - **Pen** (smooth ink strokes with quadratic Bézier curves).
  - **Eraser** (vector stroke eraser).
  - **Hand** (pan tool).
  - **Colors**: White by default, with custom color picker.
- **Grid & Themes**:
  - Infinite dynamic background: **Dots**, **Grid lines**, or **None**.
  - **Dark** and **Light** themes.
- **History & Persistence**:
  - Undo and Redo via buttons and shortcuts (`Ctrl+Z` / `Ctrl+Y`).
  - Auto-save to `localStorage`.
- **Zen Mode**:
  - Toggle UI visibility with `F` key for distraction-free drawing.

---

## ⌨️ Controls & Shortcuts

| Action | Mouse / Touch | Shortcut |
| :--- | :--- | :--- |
| **Draw** | Left Click / Touch | — |
| **Pan** | Hold `Space` + Drag / Middle Click / 2 fingers | `H` |
| **Zoom** | Mouse Wheel / Pinch gesture | `Ctrl` + `+` / `-` |
| **Reset Zoom (100%)** | Click zoom percentage | `0` |
| **Fit to Content** | Fit button | `Shift` + `1` |
| **Pen Tool** | Toolbar button | `B` or `P` |
| **Eraser Tool** | Toolbar button | `E` |
| **Undo** | Toolbar button | `Ctrl` + `Z` |
| **Redo** | Toolbar button | `Ctrl` + `Y` / `Ctrl` + `Shift` + `Z` |
| **Toggle UI** | Bottom-right button | `F` |
| **Shortcuts Help** | Menu item | `?` |

---

## 🚀 Deployment

The project is configured with GitHub Actions workflow at `.github/workflows/deploy.yml` for automated deployment to GitHub Pages on every push to `main`.

Live site: [https://m1tyarch.github.io/DrawAPoint/](https://m1tyarch.github.io/DrawAPoint/)
