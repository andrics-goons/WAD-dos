const ANSI = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[0-_])/g

// removes colour and cursor codes 
export function stripAnsi (text) {
    return text.replace(ANSI, "")
}

// output from jsh comes in chunks, for every line in each chunk, call the onLine fucntion
export function createLineSplitter (onLine) {
    // the unfinished end of the last chunk whcih is kept between calls
    let buffer = ""

    return (chunk) => {
        buffer += chunk
        const pieces = buffer.split("\n")
        // the last piece has no "\n" after it yet, so wait for the rest of it
        buffer = pieces.pop()

        for (let line of pieces) {
            // terminals end lines with "\r\n" but need to remove the "\r"
            if (line.endsWith("\r")) {
                line = line.slice(0, -1)
            }
            // a "\r" in the middle means the line was redrawn (progress bars), keep what's on screen
            line = line.slice(line.lastIndexOf("\r") + 1)
            onLine(line)
        }
    }
}