const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PipeCoin", function () {
    let PipeCoin;
    let pipeCoin;
    let owner;
    let treasury;
    let addr1;
    let addr2;
    const TOKEN_NAME = "PipeCoin";
    const TOKEN_SYMBOL = "PIPE";
    const TOTAL_SUPPLY = ethers.parseEther("420690000000"); // 420,690,000,000 tokens with 18 decimals

    beforeEach(async function () {
        // Get signers
        [owner, treasury, addr1, addr2] = await ethers.getSigners();

        // Deploy contract
        const PipeCoinFactory = await ethers.getContractFactory("PipeCoin");
        const args = [TOKEN_NAME, TOKEN_SYMBOL, treasury.address];
        pipeCoin = await PipeCoinFactory.deploy(...args);
        await pipeCoin.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the correct token name", async function () {
            expect(await pipeCoin.name()).to.equal(TOKEN_NAME);
        });

        it("Should set the correct token symbol", async function () {
            expect(await pipeCoin.symbol()).to.equal(TOKEN_SYMBOL);
        });

        it("Should set the correct decimals", async function () {
            expect(await pipeCoin.decimals()).to.equal(18);
        });

        it("Should mint total supply to treasury", async function () {
            const treasuryBalance = await pipeCoin.balanceOf(treasury.address);
            expect(treasuryBalance).to.equal(TOTAL_SUPPLY);
        });

        it("Should set the correct owner", async function () {
            expect(await pipeCoin.owner()).to.equal(owner.address);
        });

        it("Should fail if treasury address is zero", async function () {
            const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
            const PipeCoinFactory = await ethers.getContractFactory("PipeCoin");
            await expect(
                PipeCoinFactory.deploy(TOKEN_NAME, TOKEN_SYMBOL, ZERO_ADDRESS)
            ).to.be.revertedWith("Invalid contract addresses");
        });
    });

    describe("Transactions", function () {
        beforeEach(async function () {
            // Transfer some tokens from treasury to addr1 for testing
            await pipeCoin.connect(treasury).transfer(addr1.address, ethers.parseEther("1000"));
        });

        it("Should transfer tokens between accounts", async function () {
            // Transfer 50 tokens from addr1 to addr2
            await pipeCoin.connect(addr1).transfer(addr2.address, ethers.parseEther("50"));
            
            const addr1Balance = await pipeCoin.balanceOf(addr1.address);
            expect(addr1Balance).to.equal(ethers.parseEther("950"));
            
            const addr2Balance = await pipeCoin.balanceOf(addr2.address);
            expect(addr2Balance).to.equal(ethers.parseEther("50"));
        });

        it("Should fail if sender doesn't have enough tokens", async function () {
            const initialAddr1Balance = await pipeCoin.balanceOf(addr1.address);
            
            await expect(
                pipeCoin.connect(addr1).transfer(addr2.address, ethers.parseEther("1001"))
            ).to.be.reverted;

            expect(await pipeCoin.balanceOf(addr1.address)).to.equal(initialAddr1Balance);
        });

        it("Should update allowances on approve", async function () {
            await pipeCoin.connect(addr1).approve(addr2.address, ethers.parseEther("100"));
            expect(await pipeCoin.allowance(addr1.address, addr2.address))
                .to.equal(ethers.parseEther("100"));
        });

        it("Should transfer tokens using transferFrom when approved", async function () {
            await pipeCoin.connect(addr1).approve(addr2.address, ethers.parseEther("100"));
            
            await pipeCoin.connect(addr2).transferFrom(
                addr1.address,
                addr2.address,
                ethers.parseEther("100")
            );

            expect(await pipeCoin.balanceOf(addr2.address))
                .to.equal(ethers.parseEther("100"));
            expect(await pipeCoin.balanceOf(addr1.address))
                .to.equal(ethers.parseEther("900"));
            expect(await pipeCoin.allowance(addr1.address, addr2.address))
                .to.equal(0);
        });

        it("Should fail transferFrom if sender doesn't have enough allowance", async function () {
            await pipeCoin.connect(addr1).approve(addr2.address, ethers.parseEther("99"));
            
            await expect(
                pipeCoin.connect(addr2).transferFrom(
                    addr1.address,
                    addr2.address,
                    ethers.parseEther("100")
                )
            ).to.be.reverted;
        });
    });

    describe("Events", function () {
        it("Should emit Transfer event on transfer", async function () {
            await pipeCoin.connect(treasury).transfer(addr1.address, ethers.parseEther("100"));
            
            await expect(pipeCoin.connect(addr1).transfer(addr2.address, ethers.parseEther("50")))
                .to.emit(pipeCoin, "Transfer")
                .withArgs(addr1.address, addr2.address, ethers.parseEther("50"));
        });

        it("Should emit Approval event on approval", async function () {
            await expect(pipeCoin.connect(addr1).approve(addr2.address, ethers.parseEther("100")))
                .to.emit(pipeCoin, "Approval")
                .withArgs(addr1.address, addr2.address, ethers.parseEther("100"));
        });
    });
});