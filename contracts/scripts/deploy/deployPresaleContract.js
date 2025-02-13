const { ethers } = require("hardhat");

async function validateAddress(address, name) {
    if (!ethers.isAddress(address)) {
        throw new Error(`Invalid ${name} address: ${address}`);
    }
    const code = await ethers.provider.getCode(address);
    if (name !== 'fundingWallet' && name !== 'admin1' && name !== 'admin2' && code === '0x') {
        throw new Error(`${name} address ${address} is not a contract`);
    }
    console.log(`✓ ${name} address validated:`, address);
}

async function setupPresale(presaleContract) {
    console.log("\nSetting up presale contract...");
    
    // Set initial IP token price (required before starting presale)
    const initialIpTokenPrice = ethers.parseUnits("0.00001", 18); // Adjust this value as needed
    console.log("Setting initial IP token price...");
    const setPriceTx = await presaleContract.setIpTokenPrice(initialIpTokenPrice);
    await setPriceTx.wait();
    console.log("IP token price set:", ethers.formatUnits(initialIpTokenPrice, 18));
}

async function main() {
    try {
        console.log("Starting PipePresale deployment...");

        const [deployer] = await ethers.getSigners();
        const balance = await ethers.provider.getBalance(deployer.address);
        console.log("Deploying contracts with account:", deployer.address);
        console.log("Account balance:", ethers.formatEther(balance), "ETH");

        // Contract addresses
        const PIPE_ADDRESS = "0x1e33ec420dF83861d06bf64323fC6EfD15BA32dd";
        const USDC_ADDRESS = "0x7391617A8714e8a16A9A0028C9426ED8e2b57F62";
        const FUNDING_WALLET = "0x965A039859a52A33912cD9Acd75c37F9BC8B34E7";
        const ADMIN1_ADDRESS = "0x965A039859a52A33912cD9Acd75c37F9BC8B34E7";  
        const ADMIN2_ADDRESS = "0x6473e847e393Fc861eE7A855Cc42c92FDf831e49";

        // Validate addresses
        console.log("\nValidating addresses...");
        await validateAddress(PIPE_ADDRESS, "PIPE");
        await validateAddress(USDC_ADDRESS, "USDC");
        await validateAddress(FUNDING_WALLET, "fundingWallet");
        await validateAddress(ADMIN1_ADDRESS, "admin1");
        await validateAddress(ADMIN2_ADDRESS, "admin2");

        console.log("Using existing token at:", PIPE_ADDRESS);
        console.log("Using USDC at:", USDC_ADDRESS);
        console.log("Using funding wallet:", FUNDING_WALLET);
        console.log("Admin 1 address:", ADMIN1_ADDRESS);
        console.log("Admin 2 address:", ADMIN2_ADDRESS);

        // Deploy PipePresale
        console.log("\nDeploying PipePresale...");
        const PipePresale = await ethers.getContractFactory("PipePresale");
        
        const deploymentTx = await PipePresale.deploy(
            PIPE_ADDRESS,     // PIPE
            USDC_ADDRESS,     // USDC token address
            FUNDING_WALLET,   // Funding wallet address
            ADMIN1_ADDRESS,   // First admin address
            ADMIN2_ADDRESS    // Second admin address
        );

        console.log("Waiting for deployment transaction...");
        await deploymentTx.waitForDeployment();
        
        const presaleAddress = await deploymentTx.getAddress();
        console.log("PipePresale deployed to:", presaleAddress);

        // Setup presale contract with initial configuration
        await setupPresale(deploymentTx);

        // Verify contract on Blockscout only when Mainnet
        const network = await ethers.provider.getNetwork();
        if (network.name === "story_mainnet") {
            console.log("Waiting for block confirmations...");
            const receipt = await deploymentTx.deploymentTransaction().wait(6);

            console.log("Verifying contract on Blockscout...");
            await hre.run("verify:verify", {
                address: presaleAddress,
                constructorArguments: [
                    PIPE_ADDRESS,
                    USDC_ADDRESS,
                    FUNDING_WALLET,
                    ADMIN1_ADDRESS,
                    ADMIN2_ADDRESS
                ],
            });
        }

        console.log("Deployment completed!");
        console.log({
            token: PIPE_ADDRESS,
            presale: presaleAddress,
            usdc: USDC_ADDRESS,
            fundingWallet: FUNDING_WALLET,
            admin1: ADMIN1_ADDRESS,
            admin2: ADMIN2_ADDRESS
        });

    } catch (error) {
        console.error("\nDeployment failed!");
        if (error.message.includes("contract code")) {
            console.error("Error: One of the addresses is not a valid contract.");
        }
        console.error("Error details:", error);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });