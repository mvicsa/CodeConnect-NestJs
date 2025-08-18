import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RatingService } from './rating.service';
import { Rating, RatingDocument } from './schemas/rating.schema';
import { LivekitSession, LivekitSessionDocument } from './session.schema';
import { LivekitRoom, LivekitRoomDocument } from './room.schema';
import { User, UserDocument } from '../users/shemas/user.schema';
import { CreateRatingDto } from './dto/create-rating.dto';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('RatingService', () => {
  let service: RatingService;
  let ratingModel: any;
  let sessionModel: any;
  let roomModel: any;
  let userModel: any;

  const mockRating = {
    _id: new Types.ObjectId(),
    sessionId: new Types.ObjectId(),
    roomId: new Types.ObjectId(),
    creatorId: new Types.ObjectId(),
    raterId: new Types.ObjectId(),
    overallRating: 5,
    technicalKnowledge: 5,
    communication: 4,
    organization: 5,
    helpfulness: 5,
    comment: 'Great session!',
    isAnonymous: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSession = {
    _id: new Types.ObjectId(),
    roomId: new Types.ObjectId(),
    participants: [
      {
        userId: new Types.ObjectId(),
        username: 'participant1',
        joinedAt: new Date(),
        leftAt: new Date(),
        isActive: false,
      },
    ],
  };

  const mockRoom = {
    _id: new Types.ObjectId(),
    name: 'Test Room',
    createdBy: new Types.ObjectId(),
  };

  const mockUser = {
    _id: new Types.ObjectId(),
    username: 'testuser',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingService,
        {
          provide: getModelToken(Rating.name),
          useValue: {
            new: jest.fn().mockResolvedValue(mockRating),
            save: jest.fn(),
            findById: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            aggregate: jest.fn(),
            findByIdAndUpdate: jest.fn(),
            findByIdAndDelete: jest.fn(),
          },
        },
        {
          provide: getModelToken(LivekitSession.name),
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: getModelToken(LivekitRoom.name),
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: getModelToken(User.name),
          useValue: {
            findById: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RatingService>(RatingService);
    ratingModel = module.get(getModelToken(Rating.name));
    sessionModel = module.get(getModelToken(LivekitSession.name));
    roomModel = module.get(getModelToken(LivekitRoom.name));
    userModel = module.get(getModelToken(User.name));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRating', () => {
    it('should create a rating successfully', async () => {
      const createRatingDto: CreateRatingDto = {
        overallRating: 5,
        technicalKnowledge: 5,
        communication: 4,
        organization: 5,
        helpfulness: 5,
        comment: 'Great session!',
        isAnonymous: false,
      };

      sessionModel.findById.mockResolvedValue(mockSession);
      roomModel.findById.mockResolvedValue(mockRoom);
      ratingModel.findOne.mockResolvedValue(null);
      ratingModel.save.mockResolvedValue(mockRating);
      ratingModel.findById.mockResolvedValue({
        ...mockRating,
        populate: jest.fn().mockReturnThis(),
      });

      const result = await service.createRating(
        mockSession._id.toString(),
        mockRating.raterId.toString(),
        createRatingDto,
      );

      expect(result).toBeDefined();
      expect(result.overallRating).toBe(5);
    });

    it('should throw error if session is still active', async () => {
      const activeSession = {
        ...mockSession,
        participants: [{ ...mockSession.participants[0], isActive: true }],
      };

      sessionModel.findById.mockResolvedValue(activeSession);

      await expect(
        service.createRating(
          mockSession._id.toString(),
          mockRating.raterId.toString(),
          {} as CreateRatingDto,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if user was not a participant', async () => {
      const sessionWithoutUser = {
        ...mockSession,
        participants: [],
      };

      sessionModel.findById.mockResolvedValue(sessionWithoutUser);
      roomModel.findById.mockResolvedValue(mockRoom);

      await expect(
        service.createRating(
          mockSession._id.toString(),
          mockRating.raterId.toString(),
          {} as CreateRatingDto,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw error if user already rated', async () => {
      sessionModel.findById.mockResolvedValue(mockSession);
      roomModel.findById.mockResolvedValue(mockRoom);
      ratingModel.findOne.mockResolvedValue(mockRating);

      await expect(
        service.createRating(
          mockSession._id.toString(),
          mockRating.raterId.toString(),
          {} as CreateRatingDto,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCreatorRatingSummary', () => {
    it('should return creator rating summary', async () => {
      const mockRatings = [
        { overallRating: 5, technicalKnowledge: 5, communication: 4, organization: 5, helpfulness: 5 },
        { overallRating: 4, technicalKnowledge: 4, communication: 5, organization: 4, helpfulness: 4 },
      ];

      ratingModel.find.mockResolvedValue(mockRatings);
      userModel.findById.mockResolvedValue(mockUser);

      const result = await service.getCreatorRatingSummary(mockRating.creatorId.toString());

      expect(result).toBeDefined();
      expect(result.totalRatings).toBe(2);
      expect(result.averageOverallRating).toBe(4.5);
    });

    it('should throw error if no ratings found', async () => {
      ratingModel.find.mockResolvedValue([]);

      await expect(
        service.getCreatorRatingSummary(mockRating.creatorId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateRating', () => {
    it('should update rating successfully', async () => {
      const updateData = { overallRating: 4 };
      const existingRating = { ...mockRating, raterId: mockRating.raterId };

      ratingModel.findById.mockResolvedValue(existingRating);
      ratingModel.findById.mockResolvedValue({
        ...mockRating,
        populate: jest.fn().mockReturnThis(),
      });

      const result = await service.updateRating(
        mockRating._id.toString(),
        mockRating.raterId.toString(),
        updateData,
      );

      expect(result).toBeDefined();
    });

    it('should throw error if user does not own rating', async () => {
      const existingRating = { ...mockRating, raterId: new Types.ObjectId() };

      ratingModel.findById.mockResolvedValue(existingRating);

      await expect(
        service.updateRating(
          mockRating._id.toString(),
          mockRating.raterId.toString(),
          {},
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteRating', () => {
    it('should delete rating successfully', async () => {
      const existingRating = { ...mockRating, raterId: mockRating.raterId };

      ratingModel.findById.mockResolvedValue(existingRating);
      ratingModel.findByIdAndDelete.mockResolvedValue(true);

      await expect(
        service.deleteRating(mockRating._id.toString(), mockRating.raterId.toString()),
      ).resolves.not.toThrow();
    });

    it('should throw error if user does not own rating', async () => {
      const existingRating = { ...mockRating, raterId: new Types.ObjectId() };

      ratingModel.findById.mockResolvedValue(existingRating);

      await expect(
        service.deleteRating(mockRating._id.toString(), mockRating.raterId.toString()),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
