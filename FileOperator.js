exportModule = {};
const fs = require("fs");
const path = require("path")

const CopyState = {
    None: 0,
    SrcIsFile: 1 << 1,
    SrcIsFolder: 1 << 2
}

function replaceCopy(src, dest, callBack, overWrite = false){
    fs.stat(src, (err)=>{
        if (err){
            callBack(err);
        } else {
            fs.stat(dest, (err)=>{
                if ( err || overWrite){
                    let inputStream = fs.createReadStream(src);
                    let outputStream = fs.createWriteStream(dest);
                    inputStream.pipe(outputStream, {end: false});
                    inputStream.on("end", ()=>{
                        outputStream.end();
                        callBack();
                    });
                } else {
                    callBack(new Error("can't overwrite the exist file." + dest));
                }
            })
        }
    })
}

// 递归创建文件夹，请注意不要在里面包含文件名称
// 比如 "/a/b/c"是可行的
// 但是 "/a/b/c/text.txt"将会创建一个带有扩展名的文件夹 (text.txt) （注意它不是文件）
function RecursiveCreateDir(destPath, callBack)
{
    destPath = path.resolve(destPath);
    fs.stat(destPath, (err, state)=>{
        if (err)
        {
            // 目标文件夹不存在
            destPathObject = path.parse(destPath);
            // 首先检查上层文件夹，使用递归来创建所有上层的文件夹。
            RecursiveCreateDir(destPathObject.dir, (err)=>{
                if (destPath != "")
                {
                    fs.mkdir(destPath, (err)=>{
                        // 创建上层文件之后再回调。
                        callBack(err);
                    });
                }
            });
        } else if (state.isFile()){
            // 文件
            callBack(new Error("cannot create folder inside a file:" + destPath));
        } else {
            // 正常回调。
            callBack(err);
        }
    })
}

// 如果src是文件夹，那么dest也必须是文件夹，将src文件夹中的内容复制到dest文件夹中。
// 如果src是文件，那么dest也必须是文件。
function MyCopy(src, dest, callBack, overWrite = false){
    fs.stat(src, (err, state)=>{
        if (err)
        {
            // 错误，源文件、文件夹必须存在。
            callBack(err);
        } else if (state.isFile()) {
            // 假设目标文件所处的文件夹不存在，递归创建那些文件夹。
            destPathObj = path.parse(dest);
            RecursiveCreateDir(destPathObj.dir, (err)=>{
                if (err){
                    throw err;
                }else{
                    replaceCopy(src, dest, (err)=>{
                        if (err)
                        {
                            callBack(err);
                        }
                    }, overWrite)
                }
            });
        }
        else if (state.isDirectory())
        {
            // 准备好一个递归调用的复制文件函数。
            function InnerCopyFolderToFolder(src, dest)
            {
                fs.readdir(src, (err, files)=>{
                    for (index in files)
                    {
                        MyCopy(path.join(src, files[index]), path.join(dest, files[index]), option, callBack);
                    }
                });
            }

            // 递归创建目标文件夹
            RecursiveCreateDir(dest, (err)=>{
                if (err){
                    callBack(err);
                }else {
                    // 创建完成之后复制文件夹内容
                    InnerCopyFolderToFolder(src, dest);
                }
            })
        }
    })
}

// 复制文件或者文件夹，
// 将src文件夹中的内容复制到dest文件夹中。
// callBack:
//  err:
//      "srcUnexist": 源文件不存在
//      "CopyFileError": 复制文件时出错
// src:
//      出错的源文件名。
exportModule.copy = MyCopy;
exportModule.mkdir = RecursiveCreateDir;

module.exports = exportModule;