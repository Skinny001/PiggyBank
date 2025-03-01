// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PiggyBank is Ownable {
    // Stablecoin addresses
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;

    
    string public savingPurpose;
    uint256 public creationDate;
    uint256 public maturityDate;
    bool public isActive;
    

    mapping(address => uint256) public tokenBalances;
    
    // Penalty percentage for early withdrawal (15%)
    uint256 public constant PENALTY_PERCENTAGE = 15;

    
    event Deposit(address indexed token, uint256 amount);
    event Withdrawal(address indexed token, uint256 amount, uint256 penalty);

    
    constructor() Ownable(msg.sender) {
        // Default initialization
        isActive = false;
    }
    
    
    function initialize(
        address owner,
        string memory _savingPurpose,
        uint256 durationDays
    ) external {
        require(!isActive, "PiggyBank already initialized");
        
        // Transfer ownership to the actual user
        _transferOwnership(owner);
        
        
        savingPurpose = _savingPurpose;
        creationDate = block.timestamp;
        maturityDate = block.timestamp + (durationDays * 1 days);
        isActive = true;
    }
    
    
    function deposit(address token, uint256 amount) external onlyOwner {
        require(isActive, "PiggyBank is no longer active");
        require(
            token == USDT || token == USDC || token == DAI,
            "Token not allowed"
        );
        require(amount > 0, "Amount must be greater than 0");
        
      
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        
       
        tokenBalances[token] += amount;
        
        emit Deposit(token, amount);
    }
    
   
    function withdraw(address token, uint256 amount) external onlyOwner {
        require(tokenBalances[token] >= amount, "Insufficient balance");
        
        uint256 penalty = 0;
        
        // Apply penalty if withdrawal is before maturity
        if (!isSavingComplete()) {
            penalty = (amount * PENALTY_PERCENTAGE) / 100;
            
            // Transfer penalty to the developer
            if (penalty > 0) {
                IERC20(token).transfer(owner(), penalty);
            }
        }
        
       
        IERC20(token).transfer(owner(), amount - penalty);
        
       
        tokenBalances[token] -= amount;
        
        
        bool allBalancesZero = true;
        
        if (tokenBalances[USDT] > 0 || tokenBalances[USDC] > 0 || tokenBalances[DAI] > 0) {
            allBalancesZero = false;
        }
        
        if (allBalancesZero) {
            isActive = false;
        }
        
        emit Withdrawal(token, amount, penalty);
    }
    
    
    function isSavingComplete() public view returns (bool) {
        return block.timestamp >= maturityDate;
    }
    
   
    function timeUntilMaturity() public view returns (uint256) {
        if (block.timestamp >= maturityDate) {
            return 0;
        }
        return maturityDate - block.timestamp;
    }
    
   
    function getTotalSavings() external view returns (
        uint256 usdtBalance,
        uint256 usdcBalance,
        uint256 daiBalance
    ) {
        return (
            tokenBalances[USDT],
            tokenBalances[USDC],
            tokenBalances[DAI]
        );
    }
}