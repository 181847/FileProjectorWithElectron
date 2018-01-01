//import { Menu } from 'electron';

const electron = require('electron');
const url = require('url');
const path = require('path');
const fs = require("fs");
const gaze = require("gaze");
const myFs = require("./FileOperator.js")
const RenderFormater = require("./IpcInstrctFormator.js").RenderFormater;
const EnumTarget = RenderFormater.EnumTarget;
const EnumOperation = RenderFormater.EnumOperation;
const fmtInstrct = RenderFormater.fmt;

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

// 如果以对应的文件路径为键值，值为undefined，说明对应的文件没有被先前的change事件占用。
// 如果只为defined，表示之前已经有一个change事件
let fileLockSet = {};
// eventFromFS = "rename" or "change",
// 当传入 rename ，通过fs检查文件是否存在，
//      存在：触发onCreate事件。
//      不存在：触发onDelete事件。
// 当传入 change，通过延迟响应来防止fs产生的连续change多次调用回调函数。
// 注意callBackS是一组函数，当然，不是非要所有的回调函数都得定义，比如可以之定义onDelete来响应删除事件。
// callBackS = {
//     onDelete: ()=>{},
//     onCreate: ()=>{},
//     onChange: ()=>{}
// }
function FileEventDispatcher(eventFromFS, fileName, callBackS, delayChangeMillisecond = 1000){
    switch(eventFromFS)
    {
    case "rename":
        fs.access(fileName, (err)=>{
            let callBack = err 
            ? [callBackS.onDelete, (delete fileLockSet[fileName]) ][0] // if error happend, means the file is been deleted, use the array's feature (the second element in the array ) to help to delete the log in fileStateSet, but still return the first element of the array which is the onDelete function. 
            : callBackS.onCreate;
            // ensure the callBack(onDelete or OnCreate) is defined.
            if (callBack)
            {
                callBack(fileName);
            }
        })
        break;

    case "change":
        // 收到文件变化事件，为了防止多个文件变换事件抵达执行多次调用，
        // 在收到这个事件的时候，判断当前文件是否被先前的change事件锁住，
        // 如果没有，添加一个锁的记录，并延迟执行回调函数
        if (! fileLockSet[fileName] && callBackS.onChange)
        {// 文件没锁，并且还有回调函数。

            // 加锁。
            fileLockSet[fileName] = true;
            // 延迟执行onChange函数。
            setTimeout(()=>{
                // 最终到达延迟时间之前仍然检查一遍file是否存在，防止在极短的时间内文件被删除。
                // 我们通过fileLockSet[filename]来判断，因为如果文件删除，会强制删除
                // 对应的文件锁，详情参考上面的case "rename"。
                if (fileLockSet[fileName])
                {
                    callBackS.onChange(fileName);
                }
                // 执行完change事件之后，删除这个锁。
                delete fileLockSet[fileName];
            }, delayChangeMillisecond);
        }
        break;

    default:
        throw new error("未知的文件事件:" + eventFromFS);
        break;
    }
}

class Projector{
    constructor(renderName){
        // renderName用于区分不同的Projector。
        this.m_renderName = renderName;
        this.m_sourceFolder = "";
        this.m_destFolder = "";

        this.m_sourceWatcher = null;
        this.m_destWatcher = null;

        ipcMain.on(fmtInstrct(this.m_renderName, EnumTarget.SOURCE, EnumOperation.FOLDER_CHANGE), 
            (err, srcFolderPath)=>{
                this.setSourceFolder(srcFolderPath);
            }
        )

        ipcMain.on(fmtInstrct(this.m_renderName, EnumTarget.DESTINATION, EnumOperation.FOLDER_CHANGE),
            (ev, destFolderPath)=>{
                this.setDestFolder(destFolderPath);
            }
        )
    }

    getRenderName(){
        return this.m_renderName;
    }// function getRenderName()

    // 用于构建一个简单的用于向render传递文件信息的类，relativeFile表示相对于监控文件夹的文件路径。
    // parentFile 则是被监控的文件夹。
    buildFileDescForRender(relativeFile, parentFile){
        return {
            relative: relativeFile, 
            parent:   parentFile,
            absolute: path.join(relativeFile, parentFile)
        };
    }

    // 文件变化事件的进程通信规格
    // Render:****:[src, dest]:[folderChange, newSingleFile, deleteSingleFile]
    setSourceFolder(srcFolder){
        // 清除上一次的源文件监控。
        if (this.m_sourceWatcher){
            this.m_sourceWatcher.close();
            this.m_sourceWatcher = null;
        }
        // 删除之前的监控目标文件夹。
        this.m_sourceFolder = "";
        srcFolder = path.resolve(srcFolder);

        // 检查是否和目标文件夹重合。
        if (srcFolder == this.m_destFolder){
            mainWindow.webContents.send(fmtInstrct(this.m_renderName, 
                EnumTarget.SOURCE, EnumOperation.INVALID_FOLDER), srcFolder + "已经作为目标文件夹被监控");
            return;
        }
        fs.readdir(srcFolder, (err, files)=>{
            if (err){
                mainWindow.webContents.send(fmtInstrct(this.m_renderName, 
                    EnumTarget.SOURCE, EnumOperation.INVALID_FOLDER), srcFolder);
            } else {
                // 记录新的源文件夹路径。
                this.m_sourceFolder = srcFolder;
                // 发送源文件夹更改信息。
                mainWindow.webContents.send(fmtInstrct(this.m_renderName,
                    EnumTarget.SOURCE, EnumOperation.FOLDER_CHANGE), this.m_sourceFolder);

                // 初始化当前源文件夹列表中的文件
                for (var fIndex in files){
                    mainWindow.webContents.send(fmtInstrct(this.m_renderName,
                        EnumTarget.SOURCE, EnumOperation.NEW_FILE), 
                        this.buildFileDescForRender(files[fIndex], srcFolder));
                }
                
                this.m_sourceWatcher = this.AddFolderWatcher(this.m_sourceFolder, EnumTarget.SOURCE);
            }
        })
    }// function setSourceFolder()

    setDestFolder(destFolder){
        // 清除上一次的目标文件监控。
        if (this.m_destWatcher){
            this.m_destWatcher.close();
            this.m_destWatcher = null;
        }
        // 删除之前的监控目标文件夹。
        this.m_destFolder = "";
        destFolder = path.resolve(destFolder);

        // 检查是否和源文件夹重合。
        if (destFolder == this.m_sourceFolder){
            mainWindow.webContents.send(fmtInstrct(this.m_renderName, 
                EnumTarget.DESTINATION, EnumOperation.INVALID_FOLDER), destFolder + "已经作为源文件夹被监控");
            return;
        }
        fs.readdir(destFolder, (err, files)=>{
            if (err){
                mainWindow.webContents.send(fmtInstrct(this.m_renderName, 
                    EnumTarget.DESTINATION, EnumOperation.INVALID_FOLDER), destFolder + "不是文件夹");
            } else {
                
                // 记录新的源文件夹路径。
                this.m_destFolder = destFolder;
                // 发送源文件夹更改信息。
                mainWindow.webContents.send(fmtInstrct(this.m_renderName,
                    EnumTarget.DESTINATION, EnumOperation.FOLDER_CHANGE), 
                    this.m_destFolder);

                // 初始化当前源文件夹列表中的文件
                for (var fIndex in files){
                    mainWindow.webContents.send(fmtInstrct(this.m_renderName,
                        EnumTarget.DESTINATION, EnumOperation.NEW_FILE), 
                        this.buildFileDescForRender(files[fIndex], destFolder));
                }
                
                this.m_destWatcher = this.AddFolderWatcher(this.m_destFolder, EnumTarget.DESTINATION);
            }
        })
    }

    // 为某个文件夹添加监控，监听创建、删除、修改事件，向对应的进程发送信息。
    // 返回对应的fs.watcher.
    AddFolderWatcher(folderPath, targetSourceOrDest){
        return fs.watch(folderPath, {recursive: true}, (event, fileName)=>{
            this.doWhenFile(path.join(folderPath, fileName), ()=>{
                console.log("文件改动: " + event + " 路径:" + fileName);
                // 注意下面的fn是绝对路径，但是同时会传递一个监控文件夹的路径，方便求解相对路径。
                FileEventDispatcher(event, path.join(folderPath, fileName), {
                    // callBackFunctions 
                    onCreate: (fn)=>{
                        mainWindow.webContents.send(fmtInstrct(this.m_renderName, 
                            targetSourceOrDest, EnumOperation.NEW_FILE), 
                            this.buildFileDescForRender(fileName, folderPath));
                    },
                    onDelete: (fn)=>{
                        mainWindow.webContents.send(fmtInstrct(this.m_renderName, 
                            targetSourceOrDest, EnumOperation.DELETE_FILE), 
                            this.buildFileDescForRender(fileName, folderPath));
                    },
                    onChange: (fn)=>{
                        mainWindow.webContents.send(fmtInstrct(this.m_renderName, 
                            targetSourceOrDest, EnumOperation.FILE_CHANGE), 
                            this.buildFileDescForRender(fileName, folderPath));
                    }
                })// FileEventDispatcher()
            })// this.doWhenFile
        })// return fs.watch
    }// function AddFolderWatcher()

    // 检查路径是否为文件，如果为文件就执行callWhenFile，否则执行callNotFile，
    // 将fs.stat()回调中的error和state对象作为回调的参数。
    // callNotFile可以为空。
    doWhenFile(filePath, callWhenFile, callNotFile){
        fs.stat(filePath, (err, state)=>{
            if ( ! err && state.isFile()){
                callWhenFile(err, state);
            } else {
                callNotFile && callNotFile(err, state);
            }
        })

    }

}

let projectorSet = {};
ipcMain.on("newProjector", (err, renderName)=>{
    projectorSet[renderName] = new Projector(renderName);
})
