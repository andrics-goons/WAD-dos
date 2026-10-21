// Entry for connect.html. Relays messages between a popped out preview window and the
// webcontainer running in the workspace tab, so the preview can find its project.
import { setupConnect } from "@webcontainer/api/connect"

setupConnect()
