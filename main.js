//import { Menu } from 'electron';

const electron = require('electron');
const url = require('url');
const path = require('path')
const fs = require("fs");

const {app, BrowserWindow, Menu, ipcMain} = electron;

let mainWindow;

process.env.NODE_ENV = "development"

app.on('ready', ()=>{
    // create 
    mainWindow = new BrowserWindow({
        width: 500,
        height:400
    });

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file',
        slashes: true
    }));

    mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
    mainWindow.setMenu(mainMenu);
})

app.on("quite", ()=>{
    mainWindow = null;
})

const mainMenuTemplate=[
    {
        label: "文件",
        submenu:[
            {
                label: "退出",
                accelerator: process.platform == "darwin" ? "Command+!" : "Ctrl+Q",
                click(){
                    app.quit();
                }
            }
        ]
    }
]

if (process.env.NODE_ENV != "production"){
    mainMenuTemplate.push({
        label: "调试工具",
        submenu:[
            {
                label: "打开调试界面",
                accelerator: process.platform == "darwin" ? "Command+Q" : "Ctrl+Q",
                click(e, focusedWindow){
                    focusedWindow.toggleDevTools();
                }
            },
            {
                label: "重新加载",
                role: "reload"
            }
        ]
    })
}

ipcMain.on("fileDrop:newSrcFile", (e, filePath)=>{
    fs.readdir(filePath, (error, files)=>{
        if (error)
        {
            mainWindow.webContents.send("fileDrop:invalidSrcFolder");
        }
        else
        {
            // 发送文件夹添加指令。
            mainWindow.webContents.send("fileDrop:addSrcFolder", filePath);

            // 发送单独的文件添加指令
            for (var index in files)
            {
                mainWindow.webContents.send("fileDrop:addSrcSingleFile", files[index]);
            }
        }
    })
})
