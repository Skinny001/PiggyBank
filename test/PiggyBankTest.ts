import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, BigNumber } from "ethers";

// Mock ERC20 contract for testing
const MockERC20 = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name, string memory symbol, uint8 decimalsValue) ERC20(name, symbol) {
        _decimals = decimalsValue;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
`;

describe("PiggyBank and Factory Contracts", function () {
  let PiggyBank: any;
  let PiggyBankFactory: any;
  let factory: Contract;
  let piggyBank: Contract;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let developer: SignerWithAddress;
  let usdt: Contract;
  let usdc: Contract;
  let dai: Contract;

  // Constants for testing
  const SAVING_PURPOSE = "Test Saving";
  const DURATION_DAYS = 90;
  const DEPOSIT_AMOUNT = ethers.utils.parseUnits("100", 6); // 100 USDT/USDC (6 decimals)
  const DEPOSIT_AMOUNT_DAI = ethers.utils.parseUnits("100", 18); // 100 DAI (18 decimals)

  beforeEach(async function () {
    // Get signers
    [owner, user1, user2, developer] = await ethers.getSigners();

    // Deploy mock tokens
    const MockToken = await ethers.getContractFactory("MockERC20", owner);
    usdt = await MockToken.deploy("USDT Mock", "USDT", 6);
    usdc = await MockToken.deploy("USDC Mock", "USDC", 6);
    dai = await MockToken.deploy("DAI Mock", "DAI", 18);

    // Deploy PiggyBank contract
    PiggyBank = await ethers.getContractFactory("PiggyBank", owner);
    const piggyBankImpl = await PiggyBank.deploy();

    // Deploy factory contract
    PiggyBankFactory = await ethers.getContractFactory("PiggyBankFactory", owner);
    factory = await PiggyBankFactory.deploy();

    // Mint tokens to users
    await usdt.mint(owner.address, DEPOSIT_AMOUNT.mul(10));
    await usdc.mint(owner.address, DEPOSIT_AMOUNT.mul(10));
    await dai.mint(owner.address, DEPOSIT_AMOUNT_DAI.mul(10));
    await usdt.mint(user1.address, DEPOSIT_AMOUNT.mul(10));
    await usdc.mint(user1.address, DEPOSIT_AMOUNT.mul(10));
    await dai.mint(user1.address, DEPOSIT_AMOUNT_DAI.mul(10));

    // Override token addresses in PiggyBank contract for testing
    // Note: We need to modify the contract to accept these addresses for testing
    await network.provider.send("hardhat_setStorageAt", [
      piggyBankImpl.address,
      "0x0", // Storage slot for USDT constant
      ethers.utils.hexZeroPad(usdt.address, 32)
    ]);
    await network.provider.send("hardhat_setStorageAt", [
      piggyBankImpl.address,
      "0x1", // Storage slot for USDC constant
      ethers.utils.hexZeroPad(usdc.address, 32)
    ]);
    await network.provider.send("hardhat_setStorageAt", [
      piggyBankImpl.address,
      "0x2", // Storage slot for DAI constant
      ethers.utils.hexZeroPad(dai.address, 32)
    ]);
  });

  describe("PiggyBankFactory", function () {
    it("Should deploy the factory and set the developer correctly", async function () {
      expect(await factory.developer()).to.equal(owner.address);
      expect(await factory.implementation()).to.not.equal(ethers.constants.AddressZero);
    });

    it("Should create a new PiggyBank with standard method", async function () {
      const tx = await factory.createPiggyBank(SAVING_PURPOSE, DURATION_DAYS);
      const receipt = await tx.wait();
      
      // Find the PiggyBankCreated event
      const event = receipt.events?.find((e: any) => e.event === "PiggyBankCreated");
      expect(event).to.not.be.undefined;
      
      // Get the address of the new PiggyBank
      const piggyBankAddress = event?.args?.piggyBank;
      
      // Get the PiggyBank contract
      piggyBank = await PiggyBank.attach(piggyBankAddress);
      
      // Check if the PiggyBank was initialized correctly
      expect(await piggyBank.savingPurpose()).to.equal(SAVING_PURPOSE);
      expect(await piggyBank.owner()).to.equal(owner.address);
      expect(await piggyBank.isActive()).to.equal(true);
      
      // Check that it's tracked in the factory
      expect(await factory.allPiggyBanks(0)).to.equal(piggyBankAddress);
      const userBanks = await factory.getPiggyBanks(owner.address);
      expect(userBanks[0]).to.equal(piggyBankAddress);
    });

    it("Should create a new PiggyBank with CREATE2 method", async function () {
      const salt = ethers.utils.id("test-salt");
      
      // Predict the address
      const predictedAddress = await factory.predictPiggyBankAddress(salt);
      
      // Create the PiggyBank
      const tx = await factory.createPiggyBankWithCreate2(SAVING_PURPOSE, DURATION_DAYS, salt);
      const receipt = await tx.wait();
      
      // Find the PiggyBankCreated event
      const event = receipt.events?.find((e: any) => e.event === "PiggyBankCreated");
      expect(event).to.not.be.undefined;
      
      // Get the address of the new PiggyBank
      const piggyBankAddress = event?.args?.piggyBank;
      
      // Check if the address matches the prediction
      expect(piggyBankAddress).to.equal(predictedAddress);
      
      // Get the PiggyBank contract
      piggyBank = await PiggyBank.attach(piggyBankAddress);
      
      // Check if the PiggyBank was initialized correctly
      expect(await piggyBank.savingPurpose()).to.equal(SAVING_PURPOSE);
    });

    it("Should allow setting a new developer address", async function () {
      await factory.setDeveloper(developer.address);
      expect(await factory.developer()).to.equal(developer.address);
    });
  });

  describe("PiggyBank", function () {
    beforeEach(async function () {
      // Create a new PiggyBank for each test
      const tx = await factory.createPiggyBank(SAVING_PURPOSE, DURATION_DAYS);
      const receipt = await tx.wait();
      const event = receipt.events?.find((e: any) => e.event === "PiggyBankCreated");
      const piggyBankAddress = event?.args?.piggyBank;
      piggyBank = await PiggyBank.attach(piggyBankAddress);
    });

    it("Should accept deposits of allowed tokens", async function () {
      // Approve and deposit USDT
      await usdt.approve(piggyBank.address, DEPOSIT_AMOUNT);
      await piggyBank.deposit(usdt.address, DEPOSIT_AMOUNT);
      expect(await piggyBank.tokenBalances(usdt.address)).to.equal(DEPOSIT_AMOUNT);
      
      // Approve and deposit USDC
      await usdc.approve(piggyBank.address, DEPOSIT_AMOUNT);
      await piggyBank.deposit(usdc.address, DEPOSIT_AMOUNT);
      expect(await piggyBank.tokenBalances(usdc.address)).to.equal(DEPOSIT_AMOUNT);
      
      // Approve and deposit DAI
      await dai.approve(piggyBank.address, DEPOSIT_AMOUNT_DAI);
      await piggyBank.deposit(dai.address, DEPOSIT_AMOUNT_DAI);
      expect(await piggyBank.tokenBalances(dai.address)).to.equal(DEPOSIT_AMOUNT_DAI);
    });

    it("Should not allow deposits of non-allowed tokens", async function () {
      // Deploy a new token
      const MockToken = await ethers.getContractFactory("MockERC20", owner);
      const notAllowedToken = await MockToken.deploy("NOT", "NOT", 18);
      
      // Mint tokens to owner
      await notAllowedToken.mint(owner.address, DEPOSIT_AMOUNT_DAI);
      
      // Approve and try to deposit
      await notAllowedToken.approve(piggyBank.address, DEPOSIT_AMOUNT_DAI);
      await expect(
        piggyBank.deposit(notAllowedToken.address, DEPOSIT_AMOUNT_DAI)
      ).to.be.revertedWith("Token not allowed");
    });

    it("Should allow withdrawal after duration with no penalty", async function () {
      // Deposit USDT
      await usdt.approve(piggyBank.address, DEPOSIT_AMOUNT);
      await piggyBank.deposit(usdt.address, DEPOSIT_AMOUNT);
      
      // Fast forward time to after the duration
      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
      
      // Check if saving is complete
      expect(await piggyBank.isSavingComplete()).to.equal(true);
      
      // Withdraw USDT
      const balanceBefore = await usdt.balanceOf(owner.address);
      await piggyBank.withdraw(usdt.address, DEPOSIT_AMOUNT);
      const balanceAfter = await usdt.balanceOf(owner.address);
      
      // Check if full amount was received (no penalty)
      expect(balanceAfter.sub(balanceBefore)).to.equal(DEPOSIT_AMOUNT);
      
      // Check if PiggyBank is now inactive
      expect(await piggyBank.isActive()).to.equal(false);
    });

    it("Should apply penalty for early withdrawal", async function () {
      // Deposit USDT
      await usdt.approve(piggyBank.address, DEPOSIT_AMOUNT);
      await piggyBank.deposit(usdt.address, DEPOSIT_AMOUNT);
      
      // Check if saving is not complete yet
      expect(await piggyBank.isSavingComplete()).to.equal(false);
      
      // Get developer's balance before
      const developerBalanceBefore = await usdt.balanceOf(owner.address); // owner is developer in tests
      
      // Withdraw USDT early
      const balanceBefore = await usdt.balanceOf(owner.address);
      await piggyBank.withdraw(usdt.address, DEPOSIT_AMOUNT);
      const balanceAfter = await usdt.balanceOf(owner.address);
      
      // Calculate expected penalty
      const penalty = DEPOSIT_AMOUNT.mul(15).div(100);
      const expectedAmount = DEPOSIT_AMOUNT.sub(penalty);
      
      // Check if correct amount was received (with penalty)
      expect(balanceAfter.sub(balanceBefore)).to.equal(expectedAmount);
      
      // Check if PiggyBank is now inactive
      expect(await piggyBank.isActive()).to.equal(false);
    });

    it("Should not allow deposits after withdrawal", async function () {
      // Deposit and withdraw USDT
      await usdt.approve(piggyBank.address, DEPOSIT_AMOUNT.mul(2));
      await piggyBank.deposit(usdt.address, DEPOSIT_AMOUNT);
      await piggyBank.withdraw(usdt.address, DEPOSIT_AMOUNT);
      
      // Try to deposit again
      await expect(
        piggyBank.deposit(usdt.address, DEPOSIT_AMOUNT)
      ).to.be.revertedWith("PiggyBank is no longer active");
    });

    it("Should not allow withdrawal if not owner", async function () {
      // Deposit USDT
      await usdt.approve(piggyBank.address, DEPOSIT_AMOUNT);
      await piggyBank.deposit(usdt.address, DEPOSIT_AMOUNT);
      
      // Try to withdraw as user1
      await expect(
        piggyBank.connect(user1).withdraw(usdt.address, DEPOSIT_AMOUNT)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should calculate timeUntilMaturity correctly", async function () {
      // Get initial time until maturity
      const initialTime = await piggyBank.timeUntilMaturity();
      expect(initialTime).to.be.closeTo(
        BigNumber.from(DURATION_DAYS * 24 * 60 * 60),
        60 // Allow for slight differences due to block time
      );
      
      // Fast forward half the time
      await time.increase(DURATION_DAYS * 24 * 60 * 60 / 2);
      
      // Check time again
      const halfwayTime = await piggyBank.timeUntilMaturity();
      expect(halfwayTime).to.be.closeTo(
        BigNumber.from(DURATION_DAYS * 24 * 60 * 60 / 2),
        60 // Allow for slight differences
      );
      
      // Fast forward past the duration
      await time.increase(DURATION_DAYS * 24 * 60 * 60);
      
      // Check time again
      const finalTime = await piggyBank.timeUntilMaturity();
      expect(finalTime).to.equal(0);
    });
  });

  describe("Integration Tests", function () {
    it("Should allow creating multiple PiggyBanks for different purposes", async function () {
      // Create first PiggyBank
      await factory.createPiggyBank("Vacation", 30);
      
      // Create second PiggyBank
      await factory.createPiggyBank("House", 365);
      
      // Get user's PiggyBanks
      const userBanks = await factory.getPiggyBanks(owner.address);
      expect(userBanks.length).to.equal(2);
      
      // Check total PiggyBanks
      expect(await factory.getTotalPiggyBanks()).to.equal(2);
      
      // Check first PiggyBank purpose
      const piggyBank1 = await PiggyBank.attach(userBanks[0]);
      expect(await piggyBank1.savingPurpose()).to.equal("Vacation");
      
      // Check second PiggyBank purpose
      const piggyBank2 = await PiggyBank.attach(userBanks[1]);
      expect(await piggyBank2.savingPurpose()).to.equal("House");
    });

    it("Should track PiggyBanks for different users", async function () {
      // Create PiggyBank for owner
      await factory.createPiggyBank("Owner Savings", 30);
      
      // Create PiggyBank for user1
      await factory.connect(user1).createPiggyBank("User1 Savings", 60);
      
      // Get owner's PiggyBanks
      const ownerBanks = await factory.getPiggyBanks(owner.address);
      expect(ownerBanks.length).to.equal(1);
      
      // Get user1's PiggyBanks
      const user1Banks = await factory.getPiggyBanks(user1.address);
      expect(user1Banks.length).to.equal(1);
      
      // Check total PiggyBanks
      expect(await factory.getTotalPiggyBanks()).to.equal(2);
    });
  });
});