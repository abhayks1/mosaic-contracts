// Copyright 2018 OpenST Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// ----------------------------------------------------------------------------
//
// http://www.simpletoken.org/
//
// ----------------------------------------------------------------------------

const BN = require('bn.js'),
    Utils = require("../../test_lib/utils"),
    EIP20CoGatewayHelper = require("./helpers/helper"),
    MockSafeCore = artifacts.require('MockSafeCore'),
    MessageBus = artifacts.require('MessageBus'),
    UtilityToken = artifacts.require('UtilityToken'),
    EIP20Token = artifacts.require('EIP20Token'),
    TestEIP20CoGateway = artifacts.require('TestEIP20CoGateway'),
    MockUtilityToken = artifacts.require('MockUtilityToken');

let stateRoot = "0x70b4172eb30c495bf20b5b12224cd2380fccdd7ffa2292416b9dbdfc8511585d",
    valueToken,
    mockSafeCore,
    organization,
    coGateway,
    utilityToken,
    bountyAmount,
    owner,
    staker,
    stakerBalance,
    rewardAmount,
    symbol = "OST",
    name = "Simple Token",
    decimals = 18,
    helper;

let MessageStatusEnum = {
    Undeclared: 0,
    Declared: 1,
    Progressed: 2,
    DeclaredRevocation: 3,
    Revoked: 4
};

async function _setup(accounts) {
    
    valueToken = accounts[0];
    mockSafeCore = await MockSafeCore.new(1, 2, stateRoot, accounts[1]);
    organization = accounts[2];
    coGateway = accounts[3];
    owner = accounts[8];
    utilityToken = await MockUtilityToken.new(
        symbol,
        name,
        decimals,
        valueToken,
    );
    bountyAmount = new BN(100);
    staker = accounts[7];
    stakerBalance = new BN(1000000);
    rewardAmount = new BN(100);
    
}

contract('EIP20CoGateway.progressMint() ', function (accounts) {
    
    let amount = new BN(200),
        beneficiary = accounts[4],
        gasPrice = new BN(10),
        gasLimit = new BN(10),
        nonce = new BN(1),
        hashLockObj = Utils.generateHashLock(),
        hashLock = hashLockObj.l,
        unlockSecret = hashLockObj.s,
        facilitator = accounts[5],
        intentHash,
        testEIP20CoGateway;
    helper = new EIP20CoGatewayHelper();
    
    beforeEach(async function () {
        
        await _setup(accounts);
        amount = new BN(200);
        
        intentHash = await helper.hashRedeemIntent(
            amount,
            beneficiary,
            facilitator,
            nonce,
            gasPrice,
            gasLimit,
            valueToken,
        );
        testEIP20CoGateway = await TestEIP20CoGateway.new(
            valueToken,
            utilityToken.address,
            mockSafeCore.address,
            bountyAmount,
            organization,
            coGateway,
        );
        
        await utilityToken.setCoGateway(testEIP20CoGateway.address);
        await helper.setCoGateway(testEIP20CoGateway.address);
        
    });
    
    it('should pass when facilitator is rewarded', async function () {
        
        let messageHash = await testEIP20CoGateway.setStakeMessage.call(
            intentHash,
            nonce,
            gasPrice,
            gasLimit,
            hashLock,
            staker,
        );
        await testEIP20CoGateway.setStakeMessage(
            intentHash,
            nonce,
            gasPrice,
            gasLimit,
            hashLock,
            staker,
        );
        await testEIP20CoGateway.setInboxStatus(
            messageHash,
            MessageStatusEnum.Declared,
        );
        await testEIP20CoGateway.setMints(messageHash, beneficiary, amount);
        
        let progressMintValues = await testEIP20CoGateway.progressMint.call(
            messageHash,
            unlockSecret,
            {from: facilitator},
        );
        
        let expectedMintedToken = new BN(100),
            expectedReward = new BN(100);
        
        assert.strictEqual(
            progressMintValues.beneficiary_,
            beneficiary,
            "Incorrect beneficiary address",
        );
        
        assert.strictEqual(
            amount.eq(progressMintValues.stakeAmount_),
            true,
            "Incorrect staked amount",
        );
        
        assert.strictEqual(
            expectedMintedToken.eq(progressMintValues.mintedAmount_),
            true,
            "Incorrect minted amount",
        );
        
        assert.strictEqual(
            expectedReward.eq(progressMintValues.rewardAmount_),
            true,
            "Incorrect reward to facilitator",
        );
        
        let response = await testEIP20CoGateway.progressMint(
            messageHash,
            unlockSecret,
            {from: facilitator},
        );
        
        let facilitatorBalance = await utilityToken.balanceOf(facilitator);
        let beneficiaryBalance = await utilityToken.balanceOf(beneficiary);
        
        assert.strictEqual(
            facilitatorBalance.eq(expectedReward),
            true,
            'Facilitator didnt receive reward'
        );
        
        assert.strictEqual(
            beneficiaryBalance.eq(new BN(amount - expectedReward)),
            true,
            'Minting is not done for beneficiary'
        );
    
        let expectedEvent = {
            MintProgressed: {
                _messageHash: messageHash,
                _staker: staker,
                _stakeAmount: amount,
                _mintedAmount: expectedMintedToken,
                _rewardAmount: expectedReward,
                _proofProgress: true,
                _unlockSecret: unlockSecret
            }
        };
    
        assert.equal(
            response.receipt.status,
            1,
            "Receipt status is unsuccessful"
        );
    
        let eventData = response.logs;
        await Utils.validateEvents(eventData, expectedEvent);
        
    });
    
    it('should not mint reward for zero reward amount', async function () {
        
        gasPrice = new BN(0);
        
        let messageHash = await testEIP20CoGateway.setStakeMessage.call(
            intentHash,
            nonce,
            gasPrice,
            gasLimit,
            hashLock,
            staker,
        );
        
        await testEIP20CoGateway.setStakeMessage(
            intentHash,
            nonce,
            gasPrice,
            gasLimit,
            hashLock,
            staker,
        );
        await testEIP20CoGateway.setInboxStatus(
            messageHash,
            MessageStatusEnum.Declared,
        );
        await testEIP20CoGateway.setMints(messageHash, beneficiary, amount);
        
        await testEIP20CoGateway.progressMint(
            messageHash,
            unlockSecret,
            {from: facilitator},
        );
        
        let facilitatorBalance = await utilityToken.balanceOf(facilitator);
        let beneficiaryBalance = await utilityToken.balanceOf(beneficiary);
        
        assert.strictEqual(
            beneficiaryBalance.eq(amount),
            true,
            'Balance for beneficiary should be ${amount}'
        );
        
        assert.strictEqual(
            facilitatorBalance.eq(new BN(0)),
            true,
            'Facilitator should not receive reward'
        );
        
    });
    
});
