
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import * as dotenv from "dotenv";

dotenv.config();

// Get the private key from the .env file
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
// const POLYGON_MUMBAI_RPC_URL = process.env.POLYGON_MUMBAI_RPC_URL || "";
const ALCHEMY_SEPOLIA_API_KEY_URL = process.env.ALCHEMY_SEPOLIA_API_KEY_URL || "";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    // Polygon Mumbai testnet - recommended for OpenSea testing
    // mumbai: {
    //   url: POLYGON_MUMBAI_RPC_URL,
    //   accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [],
    //   chainId: 80001,
    // },
    // Ethereum Sepolia testnet - alternative option
    sepolia: {
      url: ALCHEMY_SEPOLIA_API_KEY_URL,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [],
      chainId: 11155111,
    }
  },
  // For TypeScript compilation
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  // Etherscan verification (optional)
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  }
};

export default config;

