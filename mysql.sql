---------------------
DROP TABLE IF EXISTS `graph_data`;

CREATE TABLE `graph_data` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `project_name` varchar(255) NOT NULL DEFAULT '未命名关系图',
  `nodes_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '存储节点和边的JSON',
  `config_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '存储布局和颜色配置',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


ALTER TABLE `graph_data` ADD COLUMN `thumbnail` MEDIUMTEXT NULL COMMENT '缩略图Base64';
SELECT id, project_name, updated_at, thumbnail FROM graph_data ORDER BY sort_order ASC, updated_at DESC;