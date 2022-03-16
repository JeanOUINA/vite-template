import BigNumber from "bignumber.js";
import fetch from "node-fetch";

export const tokenIds = {
    USDT: "tti_80f3751485e4e83456059473",
    VITE: "tti_5649544520544f4b454e6e40",
    BTC: "tti_b90c9baffffc9dae58d1f33f",
    ETH: "tti_687d8a93915393b219212c73"
}

export let tokenPrices = {}
const ordering = [
    tokenIds.USDT,
    tokenIds.VITE,
    tokenIds.BTC,
    tokenIds.ETH
]

export async function fetchPrices(){
    const res = await fetch("https://api.vitex.net/api/v2/ticker/24hr")
    const json:any = await res.json()
    if(json.code !== 0)throw new Error(json.msg)
    tokenPrices = {}
    for(const pair of json.data){
        tokenPrices[`${pair.tradeToken}/${pair.quoteToken}`] = pair
    }

    // now, we need to resolve USD Prices
    // we'll take USDT as USD (even if it's not backed lol)
    for(const pair of json.data.sort((a, b) => {
        return ordering.indexOf(a.quoteToken)-ordering.indexOf(b.quoteToken)
    })){
        const pairId = `${pair.tradeToken}/${pair.quoteToken}`
        const usdtPairId = `${pair.tradeToken}/${tokenIds.USDT}`
        tokenPrices[pairId] = pair
        if(tokenPrices[usdtPairId])continue

        tokenPrices[usdtPairId] = resolveUSDPair(pair)
    }
}

setInterval(fetchPrices, 60000)

export function resolveUSDPair(pair:any){
    const quotePair = tokenPrices[`${pair.quoteToken}/${tokenIds.USDT}`]
    return {
        ...pair,
        symbol: `${pair.tradeTokenSymbol}_USDT-000`,
        quoteTokenSymbol: "USDT-000",
        quoteToken: tokenIds.USDT,
        openPrice: new BigNumber(quotePair.openPrice).times(pair.openPrice).toFixed(),
        prevClosePrice: new BigNumber(quotePair.prevClosePrice).times(pair.prevClosePrice).toFixed(),
        closePrice: new BigNumber(quotePair.closePrice).times(pair.closePrice).toFixed(),
        pricePrecision: quotePair.pricePrecision+pair.pricePrecision,
        quantityPrecision: quotePair.quantityPrecision+pair.quantityPrecision
    }
}