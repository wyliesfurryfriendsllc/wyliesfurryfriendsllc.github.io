(async () => {
    const { db, collection, addDoc } = window.WFF;
    const reviews = [
        {
            authorName: `Lucas S.`,
            service: `Drop-In Visits`,
            dateLabel: `Mar 24, 2024`,
            text: `Recommend her every time you go anywhere!`,
        },
        {
            authorName: `Kelley L.`,
            service: `Dog Walking`,
            dateLabel: `Mar 17, 2024`,
            text: `Xiaotong was incredibly responsible with arriving on time and sharing cute photos to make me feel comfortable while I was gone. I could see her compassion for animals as soon as she came to meet our senior dog, and knew she would take good care of her and her special needs. So happy to have found her and will definitely use her again!`,
        },
        {
            authorName: `Yusra A.`,
            service: `Drop-In Visits`,
            dateLabel: `Mar 12, 2024`,
            text: `Xiaotong was so easy to work with and so awesome with my cats. You can tell she really cares about what she does. Plus she takes awesome photos! Would absolutely have her back to cat sit for me again.`,
        },
        {
            authorName: `Erin L.`,
            service: `Drop-In Visits`,
            dateLabel: `Mar 09, 2024`,
            text: `She is seriously the best! She takes such detailed care of my 2 senior cats and was able to pop in last minute one evening when someone else couldn't. It's hard to leave the cats but leaving them with her eases my mind so much!`,
        },
        {
            authorName: `Leah C.`,
            service: `Drop-In Visits`,
            dateLabel: `Feb 28, 2024`,
            text: `Xiaotong did a wonderful job! I was apprehensive leaving my senior cat who is in kidney failure — but Xiaotong set my mind at ease. Lots of text check ins, and pictures. My cat was in good hands.`,
        },
        {
            authorName: `Erin L.`,
            service: `Drop-In Visits`,
            dateLabel: `Feb 27, 2024`,
            text: `She took such wonderful care of my 2 senior cats. Sent amazing updates and photos. I get anxious leaving my older cats but she put me at ease and I will be using her again!`,
        },
        {
            authorName: `Nicole S.`,
            service: `Drop-In Visits`,
            dateLabel: `Feb 18, 2024`,
            text: `Xiaotong is always so reliable and so sweet to our animals!`,
        },
        {
            authorName: `Kait M.`,
            service: `Drop-In Visits`,
            dateLabel: `Feb 13, 2024`,
            text: `Xiaotong did an excellent job! She's very responsive and does a great job relaying how the visits went. I have 2 senior cats in need of medications as well that she handled, which takes a lot of pressure off of travelling. Thank you!`,
        },
        {
            authorName: `Susan G.`,
            service: `Drop-In Visits`,
            dateLabel: `Feb 13, 2024`,
            text: `She was an amazing cat care taker. She followed all the instructions for medications so well, we highly recommend her.`,
        },
        {
            authorName: `Danny O.`,
            service: `Dog Walking`,
            dateLabel: `Feb 08, 2024`,
            text: `She is awesome!!`,
        },
        {
            authorName: `Lisa Z.`,
            service: `Drop-In Visits`,
            dateLabel: `Feb 05, 2024`,
            text: `Great pet sitter for my senior cat. Xiaotong checked with me if there were any questions on my written instructions. She also made sure to send daily videos and photos. My cat isn't very social with strangers but she was able to provide those daily doses of chin scritches.`,
        },
        {
            authorName: `Lance S.`,
            service: `Dog Walking`,
            dateLabel: `Jan 27, 2024`,
            text: `I couldn't be more pleased with Xiaotong's service. We were away for two weeks. Xiaotong filled in the middle with a nice long walk each morning. She was always prompt and sent me texts on arrival and departure as well as some great photos. We loved one of her photos so much that we used it to create an illuminated crystal. Although our boy was happy when we returned from our trip, I think he is a little depressed that he is not getting his daily visit from Xiaotong. I will surely use her services again.`,
        },
        {
            authorName: `Lucas S.`,
            service: `Drop-In Visits`,
            dateLabel: `Jan 26, 2024`,
            text: `Amazing experience! She took very good care of our fur children and the cats LOVED her. She took great pics every visit and made us feel like our cats were in very good hands while we were gone.`,
        },
        {
            authorName: `Cullen S.`,
            service: `Drop-In Visits`,
            dateLabel: `Jan 23, 2024`,
            text: `Xiaotong was great with our cat Pumpkin! She is a very skittish cat but she got her to come out of hiding for her visit. She kept me in the loop the whole time as well with many pictures.`,
        },
        {
            authorName: `Utpala D.`,
            service: `Dog Walking`,
            dateLabel: `Jan 19, 2024`,
            text: `Have had a wonderful experience with Xiaotong. She is punctual, professional and an animal lover. My dog so looked forward to his walks with her. Would highly recommend!`,
        },
        {
            authorName: `Qiyuan G.`,
            service: `Dog Walking`,
            dateLabel: `Jan 19, 2024`,
            text: `Thanks Xiaotong!`,
        },
        {
            authorName: `John S.`,
            service: `Dog Walking`,
            dateLabel: `Jan 18, 2024`,
            text: `Amazing as always! My pups love seeing her!`,
        },
        {
            authorName: `Bella Y.`,
            service: `Drop-In Visits`,
            dateLabel: `Jan 02, 2024`,
            text: `Xiaotong is an amazing sitter! She took really good care of my cat, Chunky, while I was away for the holidays. She's fast to respond, great at communication, and very thorough with her tasks. She sent me many videos and photos of my baby and I truly felt that my cat was well taken care of. I will definitely book with her again.`,
        },
        {
            authorName: `Sydney S.`,
            service: `Drop-In Visits`,
            dateLabel: `Dec 31, 2023`,
            text: `This was my first time using a pet-sitter while I would be away from home, so I was extremely nervous and had no idea what to expect. However, I was completely blown away by my experience. I was given constant updates on my little guy as well as photos and videos. I felt so relieved knowing he was in such caring hands! Couldn't be happier.`,
        },
        {
            authorName: `Natdanai P.`,
            service: `Drop-In Visits`,
            dateLabel: `Dec 30, 2023`,
            text: `She was amazing taking care of my dog. She was reliable and good at communication. I really appreciated it. Highly recommended.`,
        },
        {
            authorName: `Yiling C.`,
            service: `Drop-In Visits`,
            dateLabel: `Dec 27, 2023`,
            text: `She was extremely caring and took amazing care of my cat Charlie. She made sure Charlie got enough play time each day. Would definitely book again in the future and recommend to others.`,
        },
        {
            authorName: `Stephanie H.`,
            service: `Drop-In Visits`,
            dateLabel: `Dec 23, 2023`,
            text: `Xiaotong is a wonderful caretaker! She is very communicative, punctual and someone we can trust to take care of our puppies! She sends photos and goes above and beyond each time she visits. Thank you for everything Xiaotong! Looking forward to the next time!`,
        },
        {
            authorName: `Neetha S.`,
            service: `Dog Walking`,
            dateLabel: `Dec 16, 2023`,
            text: `Thank you for always taking the best care of Nia!`,
        },
        {
            authorName: `Gabe A.`,
            service: `Drop-In Visits`,
            dateLabel: `Dec 14, 2023`,
            text: `Phenomenal caretaker! Always goes above and beyond expectations! Snow and Storm always enjoy her company!`,
        },
        {
            authorName: `Nicole S.`,
            service: `Drop-In Visits`,
            dateLabel: `Nov 28, 2023`,
            text: `This is my first time using Rover and I lucked out with Xiaotong. She is so great with cats and dogs! She not only checks their food and water, but spends some time with them giving them so much love. Xiaotong was very prompt in her visits and provided very thorough reports. She definitely turned a first time use into an ongoing Rover user. I look forward to continuing her services in the near future!`,
        },
        {
            authorName: `Shikun P.`,
            service: `Drop-In Visits`,
            dateLabel: `Nov 27, 2023`,
            text: `Xiaotong took great care of our kitten while the family was out of town. We received prompt updates and even asked her to help on something else. I would highly recommend Xiaotong as a caregiver to anyone's pets.`,
        },
        {
            authorName: `Neetha S.`,
            service: `Dog Walking`,
            dateLabel: `Nov 12, 2023`,
            text: `Xiaotong has been walking Nia for a while! She takes great care of her and is such a pleasure to work with. She is very loving to our furry friends and they enjoy her company. We would recommend her to anyone looking for help.`,
        },
        {
            authorName: `John S.`,
            service: `Dog Walking`,
            dateLabel: `Nov 12, 2023`,
            text: `My pups love when she comes over. Excellent sitter! Highly recommended`,
        },
        {
            authorName: `Gabe A.`,
            service: `House Sitting`,
            dateLabel: `Nov 05, 2023`,
            text: `Always super reliable, timely, and provides great communication during her visits!`,
        },
        {
            authorName: `John S.`,
            service: `Dog Walking`,
            dateLabel: `Oct 31, 2023`,
            text: `Excellent person and sitter! Very attentive and responds very quickly! My pups love her! Highly recommend`,
        },
        {
            authorName: `Kayleigh S.`,
            service: `Drop-In Visits`,
            dateLabel: `Oct 29, 2023`,
            text: `Xiaotong was amazing with our cats, and went above and beyond making sure they were well cared for while we were gone. Her attention to detail, reliability and communication was amazing. We will definitely be using her in the future!`,
        },
        {
            authorName: `River M.`,
            service: `Drop-In Visits`,
            dateLabel: `Oct 22, 2023`,
            text: `Xiaotong has taken care of my cat several times now. She does a great job every time! She keeps my house so clean, and I can tell when I get home that my cat had a great time while I was away and was well taken care of. Highly recommended and very appreciated.`,
        },
        {
            authorName: `Gabe A.`,
            service: `Drop-In Visits`,
            dateLabel: `Oct 22, 2023`,
            text: `I highly recommend Xiaotong's service. She is extremely attentive to pets' needs and provides a safe, loving environment. Xiaotong's professionalism and reliability are outstanding. Her communication and the pictures made it so much easier to leave Snow and Storm in her care. I trust Xiaotong completely and have already booked her services again.`,
        },
        {
            authorName: `Qiyuan G.`,
            service: `House Sitting`,
            dateLabel: `Oct 16, 2023`,
            text: `Reliable as always!`,
        },
        {
            authorName: `Kathryn S.`,
            service: `Drop-In Visits`,
            dateLabel: `Oct 13, 2023`,
            text: `Xiaotong took care of my puppy Illie just as I would. She was so attentive and gave me lots of details about how he was doing and tons of pictures. He had a blast with her and it put my mind at ease knowing she was caring for him while I was at work. Will definitely use her again!!`,
        },
        {
            authorName: `Corinne G.`,
            service: `Drop-In Visits`,
            dateLabel: `Oct 08, 2023`,
            text: `My cat Ovechkin is an absolute ham. He loved Xiaotong cuddling him and holding him like a baby. She kept his litter clean and played with him loving him like her own! You can really tell she loves kitties and cares to communicate his activities and wellness updates. My baby had a scratch near his eye that she noticed and I knew she was really detailed in her care of him. Highly recommend Xiaotong for cat care!`,
        },
        {
            authorName: `Qiyuan G.`,
            service: `Dog Walking`,
            dateLabel: `Oct 03, 2023`,
            text: `Reliable as always!`,
        },
        {
            authorName: `River M.`,
            service: `Drop-In Visits`,
            dateLabel: `Oct 01, 2023`,
            text: `Xiaotong was amazing. She sent so many pictures and videos. I really appreciated the care she put into taking care of my animal and how well she communicated.`,
        },
        {
            authorName: `Arely C.`,
            service: `Drop-In Visits`,
            dateLabel: `Sep 20, 2023`,
            text: `I had an exceptional experience with Xiaotong who truly cared for my two cats. Her genuine love for animals was apparent from the start, and she went the extra mile in observing and understanding my cats' behavior to provide tailored care. Daily updates with photos and detailed reports showcased her dedication and attention to detail, ensuring a seamless and comfortable experience for my pets during my absence. I highly recommend Xiaotong for anyone seeking outstanding care for their furry friends.`,
        },
        {
            authorName: `Qiyuan G.`,
            service: `House Sitting`,
            dateLabel: `Aug 29, 2023`,
            text: `Xiaotong is my go-to sitter by now. See my previous reviews`,
        },
        {
            authorName: `Crystal C.`,
            service: `Dog Walking`,
            dateLabel: `Aug 17, 2023`,
            text: `I really appreciated Xiaotong walking my dog. She followed all instructions and got along with my dog great! She was also attentive to detail and concerned about an old injury on my dog's hind leg that I forgot to communicate with her. We can't wait to use her again in the future for dog walking!`,
        },
        {
            authorName: `Qiyuan G.`,
            service: `House Sitting`,
            dateLabel: `Aug 17, 2023`,
            text: `Xiaotong was professional, took great care of my dog, and diligently provided updates on how she was doing, her behavior and activities. She was great and a big help! Will book her in the future`,
        },
        {
            authorName: `Qiyuan G.`,
            service: `Dog Walking`,
            dateLabel: `Aug 15, 2023`,
            text: `She's good with my dog, on time and a quick learner.`,
        },
        {
            authorName: `Qiyuan G.`,
            service: `Dog Walking`,
            dateLabel: `Aug 11, 2023`,
            text: `Xiaotong was professional and on time. She was open to my feedback and enthusiastic about the walk. Best of all, she treated my dog with compassion and respect. I would book her again!`,
        },
    ];

    for (const r of reviews) {
        await addDoc(collection(db, `reviews`), {
            ...r,
            rating: 5,
            status: `approved`,
            colorVariant: `rc-pink`,
            source: `manual`,
            featuredOnHome: false,
            tags: [],
            createdAt: new Date(),
        });
        console.log(`Added: ${r.authorName} - ${r.dateLabel}`);
    }
    console.log(`All 44 reviews added!`);
})();
