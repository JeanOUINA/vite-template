export interface Config {
    mnemonics: string,
    node: string
}

export default require("../config.json") as Config