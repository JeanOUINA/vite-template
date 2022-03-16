import { AddressObj, ViteAPI } from "@vite/vitejs/distSrc/wallet/type"
import * as vite from "@vite/vitejs"
import WS_RPC from "@vite/vitejs-ws"
import config from "./config"
import BigNumber from "bignumber.js"
import { wait } from "./util"

const wsService = new WS_RPC(config.node, 6e4, {
    protocol: "",
    headers: "",
    clientConfig: "",
    retryTimes: Infinity,
    retryInterval: 10000
})

export let isViteReady = false
export let viteApi:ViteAPI
let r
export let viteConnectionPromise = new Promise<void>(async resolve => {
    await new Promise((resolve) => {
        viteApi = new vite.ViteAPI(wsService, () => {
            setImmediate(resolve)
        })
    })
    console.log("[VITE] Connected to node")
    await registerEvents()
    
    let events = {
        _connectConnect: viteApi["_provider"]._connectConnect,
        _connectClose: viteApi["_provider"]._connectClose
    }

    let on = viteApi["_provider"].on.bind(viteApi["_provider"])
    viteApi["_provider"].on = (e, a) => {
        if(e !== "connect" && e !== "close")return on(e, a)
        events[`_connect${e[0].toUppercase()}${e.slice(1)}`] = a
    }

    viteApi["_provider"]._connectConnect = async () => {
        if(events._connectConnect){
            try{
                events._connectConnect()
            }catch{}
        }

        console.log(`Vite reconnected!`)
        r && r()
        isViteReady = true
        await registerEvents()
    }
    viteApi["_provider"]._connectClose = async () => {
        if(events._connectClose){
            try{
                events._connectClose()
            }catch{}
        }

        if(!isViteReady)return
        isViteReady = false
        console.log(`Connection to Vite closed. Reconnecting...`)
        viteConnectionPromise = new Promise<void>(async resolve => {
            r = resolve
        })
    }
    isViteReady = true
    resolve()
})

export let snapshotHeight = 0
export const snapshotListeners = []

async function registerEvents(){
    await Promise.all([
        viteApi.subscribe("createSnapshotBlockSubscription")
        .then(async event => {
            event.on(async result => {
                snapshotHeight = Number(result[result.length-1].height)
                for(let listenerIndex in snapshotListeners){
                    const listener = snapshotListeners[listenerIndex]
                    if(listener[0] > snapshotHeight)continue
                    try{
                        listener[1]()
                    }catch{}
                    snapshotListeners.splice(listenerIndex as any, 1)
                }
            })
        }),
        viteApi.request("ledger_getSnapshotChainHeight")
        .then(result => {
            snapshotHeight = result
        })
    ])
}

export function setSnapshotTimeout(callback: () => any, snapshots:number){
    if(snapshotHeight <= 0)throw new Error("snapshotHeight should be higher than 0.")
    snapshotListeners.push([snapshotHeight+snapshots, callback])
}


export async function receive(block: any, address:AddressObj){
    console.log(`[VITE] Receiving ${block.hash}`)
    const accountBlock = vite.accountBlock.createAccountBlock("receive", {
        address: address.address,
        sendBlockHash: block.hash
    })
    accountBlock.setPrivateKey(address.privateKey)
    return sendTX(address.address, accountBlock)
}

export async function sendTX(address:string, accountBlock:any):Promise<string>{
    if(!isViteReady)await viteConnectionPromise
    accountBlock.setProvider(viteApi)

    const [
        quota,
        difficulty
    ] = await Promise.all([
        viteApi.request("contract_getQuotaByAccount", address),
        accountBlock.autoSetPreviousAccountBlock()
        .then(async () => {
            let i = 0;
            let error = null
            while(i < 3){
                try{
                    if(!isViteReady)await viteConnectionPromise
                    return await viteApi.request("ledger_getPoWDifficulty", {
                        address: accountBlock.address,
                        previousHash: accountBlock.previousHash,
                        blockType: accountBlock.blockType,
                        toAddress: accountBlock.toAddress,
                        data: accountBlock.data
                    })
                }catch(err){
                    error = err
                    if(err?.error?.code === -35005){
                        if(i !== 2)await wait(1500)
                        i++
                    }
                }
            }
            throw error
        }) as Promise<{
            requiredQuota: string;
            difficulty: string;
            qc: string;
            isCongestion: boolean;
        }>
    ])
    const availableQuota = new BigNumber(quota.currentQuota)
    if(availableQuota.isLessThan(difficulty.requiredQuota)){
        if(!isViteReady)await viteConnectionPromise
        await accountBlock.PoW(difficulty.difficulty)
    }
    await accountBlock.sign()
    
    try{
        if(!isViteReady)await viteConnectionPromise
        const block = await accountBlock.send()
        return block.hash
    }catch(err){
        throw err
    }
}