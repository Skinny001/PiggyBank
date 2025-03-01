// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./PiggyBank.sol";

contract PiggyBankFactory is Ownable {
    
    address public implementation;
    
   
    address public developer;
    
   
    address[] public allPiggyBanks;
    
    // Track user's PiggyBanks
    mapping(address => address[]) public userPiggyBanks;
    
   
    event PiggyBankCreated(
        address indexed owner,
        address indexed piggyBank,
        string purpose,
        uint256 durationDays
    );
    
    event DeveloperUpdated(address indexed developer);
    
   
    constructor() Ownable(msg.sender) {
       
        implementation = address(new PiggyBank());
        
        developer = msg.sender;
    }
    
   
    function createPiggyBank(
        string memory savingPurpose,
        uint256 durationDays
    ) external returns (address) {
        
        PiggyBank piggyBank = new PiggyBank();
        
      
        piggyBank.initialize(msg.sender, savingPurpose, durationDays);
        
        
        allPiggyBanks.push(address(piggyBank));
        userPiggyBanks[msg.sender].push(address(piggyBank));
        
        emit PiggyBankCreated(
            msg.sender,
            address(piggyBank),
            savingPurpose,
            durationDays
        );
        
        return address(piggyBank);
    }
    
   
    function createPiggyBankWithCreate2(
        string memory savingPurpose,
        uint256 durationDays,
        bytes32 salt
    ) external returns (address) {
        
        bytes memory bytecode = type(PiggyBank).creationCode;
        
        
        address payable addr;
        
        assembly {
            addr := create2(0, add(bytecode, 32), mload(bytecode), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }
        
       
        PiggyBank(addr).initialize(msg.sender, savingPurpose, durationDays);
        
       
        allPiggyBanks.push(addr);
        userPiggyBanks[msg.sender].push(addr);
        
        emit PiggyBankCreated(
            msg.sender,
            addr,
            savingPurpose,
            durationDays
        );
        
        return addr;
    }
    
   
    function predictPiggyBankAddress(bytes32 salt) external view returns (address) {
        bytes memory bytecode = type(PiggyBank).creationCode;
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );
        
        return address(uint160(uint256(hash)));
    }
    
    
    function setDeveloper(address newDeveloper) external onlyOwner {
        require(newDeveloper != address(0), "Invalid developer address");
        developer = newDeveloper;
        
        emit DeveloperUpdated(newDeveloper);
    }
    
    
    function getPiggyBanks(address user) external view returns (address[] memory) {
        return userPiggyBanks[user];
    }
    
   
    function getTotalPiggyBanks() external view returns (uint256) {
        return allPiggyBanks.length;
    }
}