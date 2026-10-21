export async function writeToContainer(webcontainer, path, content) {
    // ensuring the file is inside a folder
    const slash = path.lastIndexOf("/")
    if (slash > 0) {
        // splitting the file into the folder path and the file itself, just makes sure the parent folder exsists
        await webcontainer.fs.mkdir(path.slice(0, slash), { recursive: true })
    }
    // creates or replaces the file
    await webcontainer.fs.writeFile(path, content)
}

export function debounceByPath(fn, ms) {
    const timers = new Map()

    // function that restarts that paths timer each time
    return (path, content) => {
        clearTimeout(timers.get(path))
        timers.set(path, setTimeout(() => {
            timers.delete(path)
            fn(path, content)
        }, ms))
    }
}
