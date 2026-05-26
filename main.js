const { BrowserWindow, app, ipcMain, Menu } = require("electron");
const path = require("path");

let win;

function createWindow() {

	win = new BrowserWindow({
		width: 220,
		height: 498,
		transparent: true,
		frame: false,
		alwaysOnTop: true,
		resizable: false,
		focusable: true,

		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false
		}
	});

  	win.setAlwaysOnTop(true, "screen-saver");
  	win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

	win.loadFile(path.join(__dirname, "index.html"));
}

let dragging = false;
let offset = { x: 0, y: 0 };

ipcMain.on("drag-start", (event, mousePos) => {

	dragging = true;

	const [winX, winY] = win.getPosition();

	offset = {
		x: mousePos.x - winX,
		y: mousePos.y - winY
	};
});

ipcMain.on("drag-move", (event, mousePos) => {

	if (!dragging) return;

	win.setPosition(
		mousePos.x - offset.x,
		mousePos.y - offset.y
	);
});

ipcMain.on("drag-end", () => {
	dragging = false;
});

const animations = [
	"Waiting",
	"Stepping",
	"Jumping",
	"Zombie",
	"Waving",
	"Hula",
	"Windmill",
	"Zitabata",
	"Dervish"
];

let currentAnimation = 0;

ipcMain.on("show-context-menu", () => {

	const template = animations.map((name, i) => ({
		label: name,
		type: "radio",
		checked: i === currentAnimation,
		click: () => {
			currentAnimation = i;
			win.webContents.send("set-animation", i);
		}
	}));

	template.push(
		{ type: "separator" },
		{
			label: "Show/Hide Options",
			click: () => {
				win.webContents.send("toggle-options");
			}
		},
		{ type: "separator" },
		{
			label: "Quit",
			role: "quit"
		}
	);

	const menu = Menu.buildFromTemplate(template);

	menu.popup({
		window: win
	});
});

app.whenReady().then(createWindow);