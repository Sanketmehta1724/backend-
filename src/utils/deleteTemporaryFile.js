import fs from "fs"


const deleteTemporaryFile = async (LoaclFilePath) => {
    if(!LoaclFilePath)return null
    fs.unlink(LoaclFilePath)
    return true
}


export {deleteTemporaryFile}