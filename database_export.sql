-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: sajra
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `gallery_images`
--

DROP TABLE IF EXISTS `gallery_images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `gallery_images` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) NOT NULL,
  `caption` varchar(255) DEFAULT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `gallery_images`
--

LOCK TABLES `gallery_images` WRITE;
/*!40000 ALTER TABLE `gallery_images` DISABLE KEYS */;
INSERT INTO `gallery_images` VALUES (2,'7bcacca47355f2c4767399c4620eab8e.jpg',NULL,'2026-07-24 11:31:19');
/*!40000 ALTER TABLE `gallery_images` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `members`
--

DROP TABLE IF EXISTS `members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `members` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `name_ur` varchar(150) DEFAULT NULL,
  `gender` enum('male','female') NOT NULL,
  `dob` date DEFAULT NULL,
  `dod` date DEFAULT NULL,
  `birthplace` varchar(150) DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `bio` text DEFAULT NULL,
  `father_id` int(11) DEFAULT NULL,
  `mother_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `father_id` (`father_id`),
  KEY `mother_id` (`mother_id`),
  CONSTRAINT `members_ibfk_1` FOREIGN KEY (`father_id`) REFERENCES `members` (`id`) ON DELETE SET NULL,
  CONSTRAINT `members_ibfk_2` FOREIGN KEY (`mother_id`) REFERENCES `members` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=187 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `members`
--

LOCK TABLES `members` WRITE;
/*!40000 ALTER TABLE `members` DISABLE KEYS */;
INSERT INTO `members` VALUES (1,'Aiman Sakin MohaddiPur',NULL,'male',NULL,NULL,'Mohamadipur, Zila Azamgrah',NULL,'',NULL,NULL,'2026-07-24 09:58:12'),(2,'Mangal Sakin Amilo',NULL,'male',NULL,NULL,'Amilo',NULL,'',1,NULL,'2026-07-24 10:00:34'),(3,'Chandan Mohajir Amilo',NULL,'male',NULL,NULL,'Amilo',NULL,'Mohajir Amilo',1,NULL,'2026-07-24 10:00:34'),(4,'Haji Manullah',NULL,'male',NULL,NULL,'Amilo',NULL,'',3,NULL,'2026-07-24 10:09:16'),(5,'Abdul Wahid I',NULL,'male',NULL,NULL,'Amilo',NULL,'',3,NULL,'2026-07-24 10:11:38'),(6,'moeen Khalifa',NULL,'male',NULL,NULL,'',NULL,'',3,NULL,'2026-07-24 10:21:59'),(7,'Andul Wajid',NULL,'male',NULL,NULL,'',NULL,'',3,NULL,'2026-07-24 10:27:23'),(8,'Haji Noor mohammad',NULL,'male',NULL,NULL,'',NULL,'',3,NULL,'2026-07-24 10:28:25'),(9,'Mohad Salim Makuni',NULL,'male',NULL,NULL,'',NULL,'',4,NULL,'2026-07-24 10:31:42'),(10,'Mohd Raees Makuni',NULL,'male',NULL,NULL,'',NULL,'',4,NULL,'2026-07-24 10:32:59'),(11,'Abdul Kuddus',NULL,'male',NULL,NULL,'Amilo',NULL,'',10,NULL,'2026-07-24 10:34:04'),(12,'Abdullah',NULL,'male',NULL,NULL,'Amilo',NULL,'',11,NULL,'2026-07-24 10:36:59'),(13,'Mohd Saeed',NULL,'male',NULL,NULL,'Amilo',NULL,'',11,NULL,'2026-07-24 10:37:37'),(14,'Mohammad',NULL,'male',NULL,NULL,'',NULL,'',11,NULL,'2026-07-24 10:38:49'),(15,'Naseer Ahmad',NULL,'male',NULL,NULL,'Amilo',NULL,'',14,NULL,'2026-07-24 10:40:08'),(16,'Mohd Yaseen',NULL,'male',NULL,NULL,'Amilo',NULL,'',14,NULL,'2026-07-24 10:41:02'),(17,'Mohd Ameen',NULL,'male',NULL,NULL,'Saraimeer',NULL,'',14,NULL,'2026-07-24 10:41:41'),(18,'Abdul Mannan',NULL,'male',NULL,NULL,'Amilo',NULL,'',13,NULL,'2026-07-24 10:43:39'),(20,'Mohd Khalid',NULL,'male',NULL,NULL,'Amilo',NULL,'',13,NULL,'2026-07-24 10:51:26'),(21,'Belal Ahmad',NULL,'male',NULL,NULL,'Amilo',NULL,'',13,NULL,'2026-07-24 10:52:15'),(22,'Habibur Rahman',NULL,'male',NULL,NULL,'Amilo',NULL,'',13,NULL,'2026-07-24 10:53:33'),(23,'Helal Ahmad',NULL,'male',NULL,NULL,'Amilo',NULL,'',21,NULL,'2026-07-24 10:57:59'),(24,'Maulana Abu Talib',NULL,'male',NULL,NULL,'Amilo',NULL,'',21,NULL,'2026-07-24 10:59:00'),(25,'Anisurrahman',NULL,'male',NULL,NULL,'Amilo',NULL,'',21,NULL,'2026-07-24 10:59:37'),(26,'Maulana Tahzeeb Anwar',NULL,'male',NULL,NULL,'Amilo',NULL,'',21,NULL,'2026-07-24 11:00:12'),(27,'Fauwaz Ahamd',NULL,'male',NULL,NULL,'Amilo',NULL,'',21,NULL,'2026-07-24 11:00:46'),(29,'Lamulumuddin',NULL,'male',NULL,NULL,'',NULL,'',5,NULL,'2026-07-24 11:15:40'),(30,'Haji Musa Sakin Lohia',NULL,'male',NULL,NULL,'Lohia',NULL,'',5,NULL,'2026-07-24 11:17:40'),(31,'Dil Mohd',NULL,'male',NULL,NULL,'',NULL,'',30,NULL,'2026-07-24 11:44:11'),(32,'Haji Abdus Subhan',NULL,'male',NULL,NULL,'',NULL,'',30,NULL,'2026-07-24 11:45:39'),(33,'Haji Abdul Hameed',NULL,'male',NULL,NULL,'',NULL,'',30,NULL,'2026-07-24 11:46:37'),(34,'Haji Jumman',NULL,'male',NULL,NULL,'',NULL,'',30,NULL,'2026-07-24 11:47:11'),(35,'Azimullah',NULL,'male',NULL,NULL,'',NULL,'',30,NULL,'2026-07-24 11:47:55'),(36,'nahi pata VII',NULL,'male',NULL,NULL,'',NULL,'',31,NULL,'2026-07-24 11:50:52'),(37,'nahi pata VIII',NULL,'male',NULL,NULL,'',NULL,'',31,NULL,'2026-07-24 11:51:22'),(38,'Hafiz Abdus Samad',NULL,'male',NULL,NULL,'',NULL,'',32,NULL,'2026-07-24 11:53:10'),(39,'Abdul Sattar',NULL,'male',NULL,NULL,'',NULL,'',33,NULL,'2026-07-24 11:54:09'),(40,'Ibrahim',NULL,'male',NULL,NULL,'',NULL,'',34,NULL,'2026-07-24 11:57:07'),(41,'Abdul Gafoor',NULL,'male',NULL,NULL,'',NULL,'',34,NULL,'2026-07-24 11:57:51'),(42,'Mohd Shafique',NULL,'male',NULL,NULL,'',NULL,'',34,NULL,'2026-07-24 11:58:19'),(43,'Abdul Salam',NULL,'male',NULL,NULL,'',NULL,'',34,NULL,'2026-07-24 11:59:16'),(44,'Abdul Razique',NULL,'male',NULL,NULL,'',NULL,'',34,NULL,'2026-07-24 12:00:53'),(45,'Haji Zahir',NULL,'male',NULL,NULL,'',NULL,'',40,NULL,'2026-07-24 12:02:13'),(46,'Nahi Pata II',NULL,'male',NULL,NULL,'',NULL,'',40,NULL,'2026-07-24 12:03:04'),(47,'Mohd Bashir',NULL,'male',NULL,NULL,'',NULL,'',43,NULL,'2026-07-24 12:06:37'),(48,'nahi pata III',NULL,'male',NULL,NULL,'',NULL,'',43,NULL,'2026-07-24 12:07:09'),(49,'Mohd Anas',NULL,'male',NULL,NULL,'',NULL,'',44,NULL,'2026-07-24 12:08:19'),(50,'Abdus Sami',NULL,'male',NULL,NULL,'',NULL,'',44,NULL,'2026-07-24 12:09:38'),(51,'Salim',NULL,'male',NULL,NULL,'',NULL,'Aulad Koi Nahi',35,NULL,'2026-07-24 12:15:15'),(52,'Qasim',NULL,'male',NULL,NULL,'',NULL,'',35,NULL,'2026-07-24 12:15:35'),(53,'Mohd Nazir (I)',NULL,'male',NULL,NULL,'',NULL,'',52,NULL,'2026-07-24 12:18:25'),(54,'Akbar',NULL,'male',NULL,NULL,'Amilo',NULL,'',8,NULL,'2026-07-27 10:14:19'),(55,'Mohd Hasan urf Jinnu',NULL,'male',NULL,NULL,'Amilo',NULL,'',8,NULL,'2026-07-27 10:16:07'),(56,'Mohd Husain Urf Baap',NULL,'male',NULL,NULL,'Amilo',NULL,'',8,NULL,'2026-07-27 10:18:56'),(57,'Mohd Siddique',NULL,'male',NULL,NULL,'Amilo',NULL,'',8,NULL,'2026-07-27 10:20:11'),(58,'Abdul Hamid',NULL,'male',NULL,NULL,'Amilo',NULL,'',8,NULL,'2026-07-27 10:21:35'),(59,'Hafiz Mohd Usuf',NULL,'male',NULL,NULL,'',NULL,'',8,NULL,'2026-07-27 10:22:12'),(60,'Abdurrahman',NULL,'male',NULL,NULL,'Amilo',NULL,'',54,NULL,'2026-07-27 10:25:35'),(61,'Abdus Subhan',NULL,'male',NULL,NULL,'Amilo',NULL,'',54,NULL,'2026-07-27 10:28:25'),(62,'Abdullah',NULL,'male',NULL,NULL,'Amilo',NULL,'',55,NULL,'2026-07-27 10:29:54'),(63,'Abdul Gani',NULL,'male',NULL,NULL,'',NULL,'',56,NULL,'2026-07-27 10:58:35'),(64,'Faiz Umme Azad Rehmani',NULL,'male',NULL,NULL,'',NULL,'',56,NULL,'2026-07-27 11:03:34'),(65,'Abdul Gaffar',NULL,'male',NULL,NULL,'',NULL,'',56,NULL,'2026-07-27 11:04:09'),(66,'Mohd Nazir (II)',NULL,'male',NULL,NULL,'Amilo',NULL,'',63,NULL,'2026-07-27 11:06:41'),(67,'Mohd Nesar',NULL,'male',NULL,NULL,'Amilo',NULL,'',63,NULL,'2026-07-27 11:07:13'),(68,'Mohd Zubair',NULL,'male',NULL,NULL,'Amilo',NULL,'',66,NULL,'2026-07-27 11:09:58'),(69,'Mohd Ozair',NULL,'male',NULL,NULL,'',NULL,'',66,NULL,'2026-07-27 11:13:26'),(70,'Mohd Umair',NULL,'male',NULL,NULL,'Amilo',NULL,'',66,NULL,'2026-07-27 11:13:52'),(71,'Abdul Wahab',NULL,'male',NULL,NULL,'Amilo',NULL,'',67,NULL,'2026-07-27 11:16:34'),(72,'Abul Wafa',NULL,'male',NULL,NULL,'Amilo',NULL,'',67,NULL,'2026-07-27 11:17:02'),(73,'Molvi Aftab Ahmad',NULL,'male',NULL,NULL,'Amilo',NULL,'',67,NULL,'2026-07-27 11:17:35'),(74,'Hafiz Mushtaq Ahmad',NULL,'male',NULL,NULL,'Amilo',NULL,'',67,NULL,'2026-07-27 11:18:59'),(75,'Istiyak Ahmad',NULL,'male',NULL,NULL,'Amilo',NULL,'',67,NULL,'2026-07-27 11:20:09'),(76,'Neyaz Ahmad',NULL,'male',NULL,NULL,'Amilo',NULL,'',67,NULL,'2026-07-27 11:20:49'),(77,'Belal Ahmad',NULL,'male',NULL,NULL,'Amilo',NULL,'',65,NULL,'2026-07-27 11:23:25'),(78,'Maimuna Umme master Yaseen',NULL,'male',NULL,NULL,'Amilo',NULL,'',57,NULL,'2026-07-27 11:29:42'),(79,'Amena Umme Belal Ahmad',NULL,'male',NULL,NULL,'',NULL,'',57,NULL,'2026-07-27 11:31:52'),(80,'Nahi pata IV',NULL,'male',NULL,NULL,'Amilo',NULL,'',57,NULL,'2026-07-27 11:34:48'),(81,'Haji Abdul Azeez',NULL,'male',NULL,NULL,'Amilo',NULL,'',57,NULL,'2026-07-27 11:37:20'),(82,'Abdul Hameed',NULL,'male',NULL,NULL,'Amilo',NULL,'',57,NULL,'2026-07-27 11:38:03'),(83,'Mohd Idrees Azad Rehmani',NULL,'male',NULL,NULL,'Amilo',NULL,'',81,NULL,'2026-07-27 11:43:27'),(84,'Abdul Wahad',NULL,'male',NULL,NULL,'Amilo',NULL,'',83,NULL,'2026-07-27 11:46:44'),(85,'Abdul Wahid',NULL,'male',NULL,NULL,'Amilo',NULL,'',83,NULL,'2026-07-27 11:47:57'),(86,'nahi pata VI',NULL,'male',NULL,NULL,'Amilo',NULL,'',81,NULL,'2026-07-27 11:51:17'),(87,'Belal Ahmad',NULL,'male',NULL,NULL,'Amilo',NULL,'',86,NULL,'2026-07-27 11:52:27'),(88,'Basheer Ahmad',NULL,'male',NULL,NULL,'Amilo',NULL,'',81,NULL,'2026-07-27 11:56:45'),(89,'Haji Mohd Mustafa',NULL,'male',NULL,NULL,'Amilo',NULL,'',88,NULL,'2026-07-27 11:58:13'),(90,'Mohd Mujtba',NULL,'male',NULL,NULL,'Amilo',NULL,'',88,NULL,'2026-07-27 11:59:29'),(93,'Amir Ahmad',NULL,'male',NULL,NULL,'',NULL,'',81,NULL,'2026-07-27 12:11:49'),(94,'Zainul Abedin',NULL,'male',NULL,NULL,'Amilo',NULL,'',93,NULL,'2026-07-27 12:21:38'),(95,'Haji Abdul Kareem',NULL,'male',NULL,NULL,'Amilo',NULL,'',59,NULL,'2026-07-27 12:31:00'),(96,'Master Mohd Yaseen',NULL,'male',NULL,NULL,'Amilo',NULL,'',95,NULL,'2026-07-27 12:43:53'),(97,'Mohd Sheoeb (FCI- Adhikari)',NULL,'male',NULL,NULL,'Amilo',NULL,'',96,NULL,'2026-07-27 12:49:31'),(98,'Salahuddin',NULL,'male',NULL,NULL,'Amilo',NULL,'',96,NULL,'2026-07-27 12:50:06'),(99,'Razauddin',NULL,'male',NULL,NULL,'Amilo',NULL,'',96,NULL,'2026-07-27 12:50:23'),(100,'Suhail Ahmad',NULL,'male',NULL,NULL,'Amilo',NULL,'',96,NULL,'2026-07-27 12:50:45'),(101,'Mansur Raza',NULL,'male',NULL,NULL,'Amilo',NULL,'',96,NULL,'2026-07-27 12:52:54'),(106,'Yaar Mohd',NULL,'male',NULL,NULL,'Amilo',NULL,'',2,NULL,'2026-07-28 10:44:53'),(107,'Badlu',NULL,'male',NULL,NULL,'Amilo',NULL,'',2,NULL,'2026-07-28 10:46:03'),(108,'Wali Mohd',NULL,'male',NULL,NULL,'Amilo',NULL,'',107,NULL,'2026-07-28 11:02:07'),(109,'Bakas',NULL,'male',NULL,NULL,'',NULL,'',107,NULL,'2026-07-28 11:05:14'),(110,'Tahir',NULL,'male',NULL,NULL,'Amilo',NULL,'',107,NULL,'2026-07-28 11:05:50'),(111,'Abdurrahman (Lawald)',NULL,'male',NULL,NULL,'Amilo',NULL,'',107,NULL,'2026-07-28 11:11:33'),(112,'Abdul Haleem',NULL,'male',NULL,NULL,'AMilo',NULL,'',107,NULL,'2026-07-28 11:12:33'),(113,'Habibullah',NULL,'male',NULL,NULL,'Amilo',NULL,'',108,NULL,'2026-07-28 11:15:21'),(114,'Nasrullah',NULL,'male',NULL,NULL,'Amilo',NULL,'',108,NULL,'2026-07-28 11:15:48'),(115,'Haji Abdurraheem urf Aaiman',NULL,'male',NULL,NULL,'Amilo',NULL,'',109,NULL,'2026-07-28 11:23:49'),(116,'Saleem',NULL,'male',NULL,NULL,'Amilo',NULL,'',109,NULL,'2026-07-28 11:24:12'),(117,'Hafiz Shamzul haque',NULL,'male',NULL,NULL,'',NULL,'',115,NULL,'2026-07-28 11:30:37'),(118,'Abdul Qadir',NULL,'male',NULL,NULL,'Amilo',NULL,'',115,NULL,'2026-07-28 11:31:35'),(119,'Mohd Ibraheem',NULL,'male',NULL,NULL,'Amilo',NULL,'',112,NULL,'2026-07-28 11:34:41'),(120,'Abdul Hameed II',NULL,'male',NULL,NULL,'Amilo',NULL,'',112,NULL,'2026-07-28 11:35:31'),(121,'Mohd Ismail',NULL,'male',NULL,NULL,'',NULL,'',112,NULL,'2026-07-28 11:36:23'),(122,'Abdus Subhan (Bismil)',NULL,'male',NULL,NULL,'Amilo',NULL,'',119,NULL,'2026-07-28 11:38:50'),(123,'Zahirul Haque',NULL,'male',NULL,NULL,'Amilo',NULL,'',119,NULL,'2026-07-28 11:46:00'),(124,'Abdul Hafeez',NULL,'male',NULL,NULL,'',NULL,'',120,NULL,'2026-07-28 11:49:49'),(125,'Haji Abdur Rasheed',NULL,'male',NULL,NULL,'',NULL,'',120,NULL,'2026-07-28 11:50:25'),(126,'Abdul Majeed',NULL,'male',NULL,NULL,'',NULL,'',120,NULL,'2026-07-28 11:51:19'),(127,'naho pata',NULL,'male',NULL,NULL,'',NULL,'',106,NULL,'2026-07-28 11:53:29'),(128,'Jumman Sardar',NULL,'male',NULL,NULL,'',NULL,'',127,NULL,'2026-07-28 11:54:20'),(129,'Hakeem',NULL,'male',NULL,NULL,'',NULL,'',127,NULL,'2026-07-28 11:54:35'),(130,'Mohd Ameen II',NULL,'male',NULL,NULL,'',NULL,'',128,NULL,'2026-07-28 11:55:30'),(131,'Ibraheem Sakin (PKS)',NULL,'male',NULL,NULL,'',NULL,'',129,NULL,'2026-07-28 11:57:16'),(132,'Qasim II',NULL,'male',NULL,NULL,'',NULL,'',129,NULL,'2026-07-28 11:57:57'),(133,'Afroz Ahmad',NULL,'male',NULL,NULL,'Amilo',NULL,'',98,NULL,'2026-07-28 12:02:12'),(134,'Saifurrahman',NULL,'male',NULL,NULL,'Amilo',NULL,'',98,NULL,'2026-07-28 12:03:42'),(135,'Obaidurrahman',NULL,'male',NULL,NULL,'Amilo',NULL,'',98,NULL,'2026-07-28 12:04:11'),(136,'Anisurrahman II',NULL,'male',NULL,NULL,'Amilo',NULL,'',98,NULL,'2026-07-28 12:04:34'),(137,'Azhar Mokarim',NULL,'male',NULL,NULL,'Amilo',NULL,'',98,NULL,'2026-07-28 12:05:03'),(138,'Zafar M Warsi',NULL,'male',NULL,NULL,'Amilo',NULL,'',98,NULL,'2026-07-28 12:05:48'),(139,'Mohd Anas II',NULL,'male',NULL,NULL,'Amilo',NULL,'',133,NULL,'2026-07-28 12:06:48'),(140,'Mohd Amish',NULL,'male',NULL,NULL,'Amilo',NULL,'',133,NULL,'2026-07-28 12:07:08'),(141,'Sayem Rayyan',NULL,'male',NULL,NULL,'Amilo',NULL,'',133,NULL,'2026-07-28 12:08:25'),(142,'Shazan',NULL,'male',NULL,NULL,'Amilo',NULL,'',133,NULL,'2026-07-28 12:08:57'),(143,'Izaan',NULL,'male',NULL,NULL,'Amilo',NULL,'',133,NULL,'2026-07-28 12:09:44'),(144,'Yahya',NULL,'male',NULL,NULL,'Amilo',NULL,'',133,NULL,'2026-07-28 12:10:50'),(145,'Arshiyan',NULL,'male',NULL,NULL,'Amilo',NULL,'',134,NULL,'2026-07-28 12:15:09'),(146,'Hasan Saif',NULL,'male',NULL,NULL,'Amilo',NULL,'',134,NULL,'2026-07-28 12:15:38'),(147,'Mohd Iliyas',NULL,'male',NULL,NULL,'Amilo',NULL,'',135,NULL,'2026-07-28 12:19:26'),(148,'Jalaluddin',NULL,'male',NULL,NULL,'Amilo',NULL,'',99,NULL,'2026-07-28 12:45:33'),(149,'Arshad Saleem',NULL,'male',NULL,NULL,'Amilo',NULL,'',99,NULL,'2026-07-28 12:46:23'),(150,'Abdurrahman II',NULL,'male',NULL,NULL,'Amilo',NULL,'',99,NULL,'2026-07-28 12:47:00'),(151,'Mohd Aquib',NULL,'male',NULL,NULL,'Amilo',NULL,'',99,NULL,'2026-07-28 12:47:22'),(152,'Mohd Zayeem',NULL,'male',NULL,NULL,'Amilo',NULL,'',99,NULL,'2026-07-28 12:48:03'),(153,'Mohd Sharique',NULL,'male',NULL,NULL,'Amilo',NULL,'',99,NULL,'2026-07-29 07:11:10'),(154,'Sadique',NULL,'male',NULL,NULL,'Amilo',NULL,'',99,NULL,'2026-07-29 07:11:37'),(155,'Hafiz Mohd Ahmad',NULL,'male',NULL,NULL,'Amilo',NULL,'',99,NULL,'2026-07-29 07:12:21'),(156,'Ahmad Hussain',NULL,'male',NULL,NULL,'Amilo',NULL,'',99,NULL,'2026-07-29 07:12:56'),(157,'Saif Ali',NULL,'male',NULL,NULL,'Amilo',NULL,'',99,NULL,'2026-07-29 07:13:18'),(158,'nahi pata V',NULL,'male',NULL,NULL,'Amilo',NULL,'',99,NULL,'2026-07-29 07:14:47'),(159,'Child 1(Required)',NULL,'male',NULL,NULL,'Amilo',NULL,'',148,NULL,'2026-07-29 07:17:16'),(160,'Child 2 (Required)',NULL,'male',NULL,NULL,'Amilo',NULL,'',148,NULL,'2026-07-29 07:17:36'),(161,'Name Required',NULL,'male',NULL,NULL,'',NULL,'',100,NULL,'2026-07-29 07:24:04'),(162,'Master Mohd Shahid',NULL,'male',NULL,NULL,'Amilo',NULL,'',97,NULL,'2026-07-29 07:27:10'),(163,'Qaisar Raza',NULL,'male',NULL,NULL,'Amilo',NULL,'',97,NULL,'2026-07-29 07:27:36'),(164,'Mohd Shakeb',NULL,'male',NULL,NULL,'SultanPur',NULL,'',97,NULL,'2026-07-29 07:28:14'),(165,'Shaad',NULL,'male',NULL,NULL,'Amilo',NULL,'',162,NULL,'2026-07-29 07:29:15'),(166,'Daniyal Raza',NULL,'male',NULL,NULL,'Amilo',NULL,'',163,NULL,'2026-07-29 07:29:51'),(167,'Mohd Kaif',NULL,'male',NULL,NULL,'Amilo',NULL,'',163,NULL,'2026-07-29 07:30:13'),(168,'Nahi Pata',NULL,'male',NULL,NULL,'Amilo',NULL,'',164,NULL,'2026-07-29 07:31:53'),(169,'Abdullah II',NULL,'male',NULL,NULL,'',NULL,'',89,NULL,'2026-07-29 07:45:39'),(170,'Mohd Ismail II',NULL,'male',NULL,NULL,'Amilo',NULL,'',89,NULL,'2026-07-29 07:46:06'),(171,'Abdul Azeez',NULL,'male',NULL,NULL,'Amilo',NULL,'',89,NULL,'2026-07-29 07:47:05'),(172,'Nayeem',NULL,'male',NULL,NULL,'Amilo',NULL,'',90,NULL,'2026-07-29 07:48:31'),(173,'Maaz',NULL,'male',NULL,NULL,'Amilo',NULL,'',90,NULL,'2026-07-29 07:49:05'),(174,'Abul Qais',NULL,'male',NULL,NULL,'Amilo',NULL,'',16,NULL,'2026-07-29 08:10:47'),(175,'Razauddin II',NULL,'male',NULL,NULL,'Amilo',NULL,'',16,NULL,'2026-07-29 08:11:36'),(176,'Sabauddin',NULL,'male',NULL,NULL,'Amilo',NULL,'',16,NULL,'2026-07-29 08:12:01'),(177,'Noman',NULL,'male',NULL,NULL,'Amilo',NULL,'',84,NULL,'2026-07-29 08:18:24'),(178,'Athar',NULL,'male',NULL,NULL,'Amilo',NULL,'',84,NULL,'2026-07-29 08:18:52'),(179,'Hassan',NULL,'male',NULL,NULL,'Amilo',NULL,'',84,NULL,'2026-07-29 08:19:42'),(180,'Hannan',NULL,'male',NULL,NULL,'Amilo',NULL,'',84,NULL,'2026-07-29 08:20:03'),(181,'Abdul Mannan II',NULL,'male',NULL,NULL,'Amilo',NULL,'',84,NULL,'2026-07-29 08:20:31'),(182,'Gazi',NULL,'male',NULL,NULL,'Amilo',NULL,'',84,NULL,'2026-07-29 08:21:43'),(183,'Ragib',NULL,'male',NULL,NULL,'Amilo',NULL,'',84,NULL,'2026-07-29 08:22:09'),(184,'Molvi Haseeb',NULL,'male',NULL,NULL,'Amilo',NULL,'',85,NULL,'2026-07-29 08:24:11'),(185,'Abdur Raqib',NULL,'male',NULL,NULL,'Amilo',NULL,'',85,NULL,'2026-07-29 08:24:45');
/*!40000 ALTER TABLE `members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `spouses`
--

DROP TABLE IF EXISTS `spouses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `spouses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `member_id` int(11) NOT NULL,
  `spouse_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_pair` (`member_id`,`spouse_id`),
  KEY `spouse_id` (`spouse_id`),
  CONSTRAINT `spouses_ibfk_1` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON DELETE CASCADE,
  CONSTRAINT `spouses_ibfk_2` FOREIGN KEY (`spouse_id`) REFERENCES `members` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `spouses`
--

LOCK TABLES `spouses` WRITE;
/*!40000 ALTER TABLE `spouses` DISABLE KEYS */;
/*!40000 ALTER TABLE `spouses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `name` varchar(150) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `role` enum('admin','editor') NOT NULL DEFAULT 'editor',
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','Administrator',NULL,'admin','$2y$10$fdhW4NiEooIRNML3DdP99uwYKzJAq/NWMxKvWqkhyLju7.V3G7NKu','2026-07-24 06:27:14');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-29 16:40:20
