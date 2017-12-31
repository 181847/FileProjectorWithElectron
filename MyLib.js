module.exports = {
    print: (...args)=>{
        console.log(args);
    },
    reload: (mPath)=>{
        delete require.cache[require.resolve(mPath)];
        return require(mPath);
    }
};