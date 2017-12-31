let RenderFormater = {
    EnumTarget: {
        SOURCE: "src",
        DESTINATION: "dest"
    },
    EnumOperation:{
        INVALID_FOLDER: "invalidFolder",
        FOLDER_CHANGE: "folderChange",
        NEW_FILE:  "newFile",
        DELETE_FILE:  "deleteFile",
        FILE_CHANGE: "fileChange"
    },
    fmt(renderName, srcOrDest, operation){
        return "Render:" + renderName + ":" + srcOrDest + ":" + operation;
    }
}

module.exports.RenderFormater = RenderFormater;
