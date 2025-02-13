require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("./tasks/verifyPipeCoin"); // Add your custom task for verification

// Load private key from environment variable
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";
const CONTRACT_ADDRESS= process.env.CONTRACT_ADDRESS || "0x00000000000000000000000";
const IP_TOKEN_PRICE= process.env.IP_TOKEN_PRICE || "1000000000000000";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.27",
  networks: {
    hardhat: {
      mining: {
        auto: true,
        interval: 1000
      },
      accounts: {
        accountsBalance: "100000000000000000000000000000000"
      }
    },
    localhost: {
      url: "http://127.0.0.1:8545/",
      chainId: 31337
    },
    story_odyssey: {
      url: "https://odyssey.storyrpc.io/",
      chainId: 1516,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto", // or specify a value if needed
      timeout: 60000    // increase timeout for testnet
    }
    ,
    story_aeneid: {
      url: "https://aeneid.storyrpc.io/",
      chainId: 1315,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto", // or specify a value if needed
      timeout: 60000    // increase timeout for testnet
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  etherscan: {
    apiKey: {
      "story-odyssey": "empty" // Replace with your actual API key when available
    },
    customChains: [
      {
        network: "story-odyssey",
        chainId: 1516,
        urls: {
          apiURL: "https://odyssey.storyscan.xyz/api",
          browserURL: "https://odyssey.storyscan.xyz"
        }
      }
    ]
  }
  
};