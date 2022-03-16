import { patch as patchConsole } from "modernlog";
import { viteConnectionPromise } from "./vite";
import * as vite from "@vite/vitejs"
import config from "./config";
patchConsole()

process.on("unhandledRejection", console.error)
process.on("unhandledError", console.error)

const wallet = vite.wallet.getWallet(config.mnemonics)
const address = wallet.deriveAddress(0)

viteConnectionPromise.then(async () => {
    console.log(`Logged in as ${address.address}`)
    
})